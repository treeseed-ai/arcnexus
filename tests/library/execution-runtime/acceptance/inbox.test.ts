import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { ExecutionStore } from '../../../../dist/library/coordination-store/execution-store.js';
import { Scheduler } from '../../../../dist/library/execution-runtime/scheduler.js';

/** Proves correlated inbox decisions and journal replay against the built durable store. */
class InboxScenarios {
  /** Keeps accepted intent distinct from delivery and atomically rolls back invalid fan-out. */
  milestones(t: TestContext): void {
    const store = this.store(t);
    const run = store.createRun('task', ['a', 'b', 'c'], 'A goal');
    const a = store.enqueue(run.id, 'a', 'Root');
    const request = { key: 'b', owner: 'b', objective: 'Supply', acceptance: ['Observed'] };
    const b = store.request(a.id, { ...request, milestone: 'accepted' });
    assert.equal(store.assignment(a.id).status, 'waiting');
    store.accept(b.id);
    assert.equal(store.assignment(a.id).status, 'ready');
    assert.equal(store.assignment(b.id).status, 'ready');
    const c = store.request(a.id, { ...request, key: 'c', owner: 'c' });
    store.accept(c.id);
    assert.equal(store.assignment(a.id).status, 'waiting');
    store.complete(c.id, ['observed verification']);
    assert.equal(store.assignment(a.id).status, 'ready');
    const before = store.assignments(run.id).length;
    assert.throws(
      () =>
        store.requests(a.id, [
          { ...request, key: 'new' },
          { ...request, key: 'invalid', owner: 'missing' },
        ]),
      /owner/,
    );
    assert.equal(store.assignments(run.id).length, before);
  }

  /** Explicit review and document requests preserve their workflow and narrowed recipient scope. */
  recipientScope(t: TestContext): void {
    const store = this.store(t);
    const run = store.createRun('task', ['a', 'b'], 'A documentation goal');
    const a = store.enqueue(run.id, 'a', 'Root');
    store.updateAssignment(a.id, 'ready', {
      proposal: { kind: 'change', changeType: 'documentation' },
    });
    const request = {
      key: 'review',
      owner: 'b',
      objective: 'Review the delivered docs',
      acceptance: ['Observed'],
      kind: 'review' as const,
      changeType: null,
      allowedWritePaths: [],
    };
    const b = store.request(a.id, request);
    assert.deepEqual(b.data.proposal, {
      kind: 'review',
      changeType: 'documentation',
      allowedWritePaths: [],
    });
    assert.equal(store.request(a.id, request).id, b.id);
  }

  /** A shared objective cannot silently change an existing recipient's accepted workflow. */
  sharedScope(t: TestContext): void {
    const store = this.store(t);
    const run = store.createRun('task', ['a', 'b'], 'Shared work');
    const a = store.enqueue(run.id, 'a', 'Root');
    const b = store.enqueue(run.id, 'b', 'Review');
    store.updateAssignment(b.id, 'ready', { proposal: { kind: 'review', allowedWritePaths: [] } });
    const request = {
      key: 'shared',
      owner: 'b',
      objective: 'Review',
      acceptance: [],
      existingAssignmentId: b.id,
      kind: 'change' as const,
    };
    assert.throws(() => store.request(a.id, request), /Shared assignment/);
    assert.equal(store.assignment(a.id).dependencies.length, 0);
  }

  /** Correlates clarification, retries and rejection without releasing undelivered dependents. */
  decisions(t: TestContext): void {
    const store = this.store(t);
    const run = store.createRun('task', ['a', 'b', 'c'], 'A goal');
    const a = store.enqueue(run.id, 'a', 'Root');
    const b = store.request(a.id, { key: 'b', owner: 'b', objective: 'Supply', acceptance: [] });
    const c = store.request(b.id, { key: 'c', owner: 'c', objective: 'Nested', acceptance: [] });
    const requestId = store.inbox(c.id)[0]!.id;
    const question = { requestId, action: 'clarify' as const, text: 'Which format?' };
    store.respond(c.id, [question]);
    store.respond(c.id, [question]);
    assert.equal((store.assignment(b.id).data.questions as unknown[]).length, 1);
    assert.throws(() => store.respond(a.id, [question]), /unauthorized/);
    const answer = { requestId, action: 'answer' as const, text: 'JSON' };
    store.respond(b.id, [answer]);
    store.respond(b.id, [answer]);
    assert.equal(store.assignment(c.id).status, 'ready');
    assert.equal(store.assignment(b.id).status, 'waiting');
    store.respond(c.id, [{ requestId, action: 'reject', text: 'Requires expanded authority' }]);
    assert.equal(store.assignment(a.id).status, 'blocked');
    assert.equal(store.assignment(b.id).status, 'blocked');
  }

  /** Replays a retained scheduling outcome after a crash without executing the model twice. */
  async replay(t: TestContext): Promise<void> {
    const store = this.store(t);
    const run = store.createRun('task', ['a', 'b'], 'A goal');
    const a = store.enqueue(run.id, 'a', 'Root');
    const result = {
      kind: 'request' as const,
      receipt: 'checkpoint',
      requests: [{ key: 'durable', owner: 'b', objective: 'Supply', acceptance: [] }],
    };
    store.updateAssignment(a.id, 'ready', { pendingOutcome: result });
    store.requests(a.id, result.requests);
    store.updateAssignment(a.id, 'ready');
    const scheduler = new Scheduler(store, async () => {
      throw new Error('Must not replay model');
    });
    await scheduler.step(run.id);
    // A is waiting after the already committed request; recovery commits its retained outcome directly.
    scheduler.commit(a.id, result);
    assert.equal(store.assignments(run.id).length, 2);
    assert.equal(store.assignment(a.id).data.lastReceipt, 'checkpoint');
    assert.equal(store.assignment(a.id).data.pendingOutcome, null);
  }

  /** Duplicate crash-recovery delivery cannot rewind the accumulated candidate after later verified work. */
  promotions(t: TestContext): void {
    const store = this.store(t);
    const first = store.createRun('task', ['a'], 'First');
    const second = store.createRun('task', ['a'], 'Second');
    for (const run of [first, second])
      store.updateRun(run.id, 'running', { authorityBase: 'base', packageId: 'package' });
    const a = store.enqueue(first.id, 'a', 'First change');
    const b = store.enqueue(second.id, 'a', 'Next change');
    const candidate = { candidateRevision: 'first', verifiedEvidence: ['first proof'] };
    store.complete(a.id, ['first proof'], candidate);
    store.complete(b.id, ['second proof'], {
      candidateRevision: 'second',
      verifiedEvidence: ['second proof'],
    });
    const scheduler = new Scheduler(store, async () => {
      throw new Error('No model replay');
    });
    scheduler.commit(a.id, { kind: 'completed', evidence: ['first proof'], candidate });
    assert.equal(store.latestDelivery('base', 'package')!.data.candidateRevision, 'second');
    assert.equal(store.assignment(a.id).status, 'completed');
    assert.throws(() => store.complete(a.id, ['forged proof'], candidate), /disagrees/);
  }

  /** Creates a private store with deterministic cleanup. */
  private store(t: TestContext): ExecutionStore {
    const directory = mkdtempSync(join(tmpdir(), 'arcnexus-inbox-'));
    const store = new ExecutionStore(join(directory, 'execution.sqlite'));
    t.after(() => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    });
    return store;
  }
}

const scenarios = new InboxScenarios();

test('inbox acceptance milestones and atomic fan-out', (t) => scenarios.milestones(t));

test('correlated clarification and transitive rejection', (t) => scenarios.decisions(t));

test('durable scheduling outcomes deduplicate crash replay', (t) => scenarios.replay(t));

test('duplicate verified delivery cannot rewind the accumulated candidate', (t) =>
  scenarios.promotions(t));

test('inbox requests preserve explicit recipient workflow and narrowed scope', (t) =>
  scenarios.recipientScope(t));

test('shared recipient work rejects conflicting workflow authority', (t) =>
  scenarios.sharedScope(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
