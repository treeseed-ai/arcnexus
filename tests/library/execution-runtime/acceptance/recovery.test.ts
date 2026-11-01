import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ExecutionLease } from '../../../../dist/library/coordination-store/execution-store.js';
import { StewardshipPolicy } from '../../../../dist/library/workday/workday.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Exercises host ownership and recovery without substituting model claims for observed delivery. */
class RecoveryScenarios {
  /** Ensures only one host can own a canonical project and releasing it permits a replacement. */
  lease(t: TestContext): void {
    const f = new GeneralFixture(t).fixture;
    const path = join(f.state, 'host-lease.sqlite');
    const lease = new ExecutionLease(path);
    assert.throws(() => new ExecutionLease(path), /already owns/);
    lease.close();
    new ExecutionLease(path).close();
  }

  /** A clarified older task cannot steal the project halfway through another task's assignments. */
  async taskOwnership(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const first = host.submit('Question requiring an answer');
    host.store.updateRun(first.id, 'needs_input', { questions: ['Which scope?'] });
    const second = host.submit('Research the supplier chain');
    await host.tick();
    assert.ok(host.store.assignments(second.id).length > 0);
    host.answer(first.id, 'Use the declared scope');
    await host.tick();
    assert.ok(host.store.assignments(second.id).some((a) => a.data.recordId));
    assert.equal(host.store.assignments(first.id).length, 0);
  }

  /** Recovery never repeats workspace setup whose completion is not recorded durably. */
  async reconciliation(t: TestContext, committed: boolean): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    let host = new ProjectHost(f.state, context);
    const task = host.submit('Research supplier evidence');
    await host.tick();
    await host.tick();
    const original = host.store.assignments(task.id)[0]!;
    const path = join(f.state, 'runs', String(original.data.recordId), 'report.json');
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (committed) record.reconciliationId = 'replacement-workspace';
    writeFileSync(path, JSON.stringify(record));
    host.cancel(task.id);
    host.control('start');
    const workday = host.store.runs().at(-1)!;
    const assignment = host.store.enqueue(workday.id, 'a', 'Retained work');
    host.store.updateAssignment(assignment.id, 'running', {
      recordId: record.id,
      reconciliation: { recordId: 'replacement-workspace' },
    });
    host.store.close();
    host = new ProjectHost(f.state, context);
    t.after(() => host.store.close());
    if (committed) host.control('resume');
    else assert.throws(() => host.control('resume'), /uncertain workspace preparation/);
    assert.equal(host.store.assignment(assignment.id).status, committed ? 'ready' : 'interrupted');
    assert.equal(host.store.run(workday.id).status, committed ? 'running' : 'needs_attention');
  }

  /** Changing an early owner's inputs cannot repeatedly skip the rest of the rotation. */
  rotation(t: TestContext): void {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    const host = new ProjectHost(f.state, context);
    t.after(() => host.store.close());
    host.control('start');
    const run = host.store.runs()[0]!;
    const policy = new StewardshipPolicy(context);
    assert.equal(policy.next(run, [])?.owner, 'a');
    run.data.lastSteward = 'a';
    assert.equal(policy.next(run, [])?.owner, 'b');
    run.data.lastSteward = 'b';
    assert.equal(policy.next(run, [])?.owner, 'c');
    run.data.lastSteward = 'c';
    assert.equal(policy.next(run, [])?.owner, 'a');
  }

  /** Obsolete executable settings fail preflight instead of silently changing scheduling semantics. */
  defaults(t: TestContext): void {
    const f = new GeneralFixture(t).fixture;
    const path = join(f.repo, 'architecture/execution.yaml');
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, original + 'maxTurns: 5\n');
    f.commit();
    assert.throws(
      () => new ExecutionContext().resolve(f.repo),
      /Unsupported execution setting: maxTurns/,
    );
    writeFileSync(path, original.replace('defaultPackage: package', 'defaultPackage: 42'));
    f.commit();
    assert.throws(() => new ExecutionContext().resolve(f.repo), /defaultPackage must be/);
  }

  /** Reconciles already observed delivery while retaining uncertain engineering as interrupted. */
  recovery(t: TestContext): void {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    let host = new ProjectHost(f.state, context);
    host.control('start');
    const run = host.store.runs()[0]!;
    const a = host.store.enqueue(run.id, 'a', 'Uncertain operation');
    const b = host.store.enqueue(run.id, 'b', 'Verified delivery');
    host.store.updateAssignment(a.id, 'running');
    host.store.updateAssignment(b.id, 'running', {
      pendingOutcome: {
        kind: 'completed',
        evidence: ['retained observed verifier report'],
        receipt: 'known-result',
      },
    });
    host.store.close();
    host = new ProjectHost(f.state, context);
    t.after(() => host.store.close());
    assert.equal(host.store.assignment(a.id).status, 'interrupted');
    assert.equal(host.store.assignment(b.id).status, 'completed');
    assert.equal(host.store.run(run.id).status, 'interrupted');
    assert.throws(() => host.control('resume'));
    host.control('stop');
    host.control('pause');
    assert.equal(host.store.run(run.id).status, 'stopped');
    assert.throws(() => host.control('resume'), /Stopped/);
    host.control('start');
    assert.equal(host.store.assignments(host.store.runs().at(-1)!.id).length, 0);
  }
}

const scenarios = new RecoveryScenarios();

test('project execution has one process-lifetime lease', (t) => scenarios.lease(t));

test('answered tasks wait for the current task to release project execution', (t) =>
  scenarios.taskOwnership(t));

test('host recovery commits known outcomes and retains uncertain operations', (t) =>
  scenarios.recovery(t));

test('host recovery retains uncertain reconciliation without replaying setup', (t) =>
  scenarios.reconciliation(t, false));

test('host recovery accepts a durably completed reconciliation checkpoint', (t) =>
  scenarios.reconciliation(t, true));

test('stewardship rotation retains position when an earlier owner changes', (t) =>
  scenarios.rotation(t));

test('obsolete and malformed execution defaults fail preflight', (t) => scenarios.defaults(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
