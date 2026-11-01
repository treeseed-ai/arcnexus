import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises director diagnosis without losing retained plans or bypassing uncertain checkpoints. */
class BlockedContinuationScenarios {
  /** Safe continuation preserves supplier identity and releases dependents only after verified delivery. */
  async safe(t: TestContext): Promise<void> {
    const { host, run, root, supplier } = await this.fixture(t);
    const before = this.record(host, supplier.id);
    host.store.fail(supplier.id, 'blocked', 'Blocking dependency proposal requires clarification');
    await host.tick();
    assert.equal(host.store.run(run.id).status, 'running');
    assert.equal(host.store.assignment(supplier.id).status, 'ready');
    assert.equal(host.store.assignment(root.id).status, 'waiting');
    assert.deepEqual(this.record(host, supplier.id).plan, before.plan);
    assert.equal(this.record(host, supplier.id).threadId, before.threadId);
    for (let observation = 0; observation < 5; observation++) {
      await host.tick();
      if (host.store.assignment(supplier.id).status === 'completed') break;
    }
    assert.equal(host.store.assignment(supplier.id).status, 'completed');
    assert.equal(host.store.assignment(root.id).status, 'ready');
    assert.equal(host.store.assignments(run.id).length, 2);
  }

  /** A completed blocked model response is routed durably and later resumed from its same safe plan. */
  async completedBlock(t: TestContext): Promise<void> {
    const { host, run, root, supplier } = await this.fixture(t, 'REPORT_BLOCK_ONCE');
    const before = this.record(host, supplier.id);
    await host.tick();
    assert.equal(host.store.assignment(supplier.id).status, 'blocked');
    assert.equal(this.record(host, supplier.id).safeCheckpoint, true);
    assert.equal(host.store.assignment(root.id).status, 'blocked');
    await host.tick();
    assert.equal(host.store.assignment(supplier.id).status, 'ready');
    assert.deepEqual(this.record(host, supplier.id).plan, before.plan);
    await host.tick();
    assert.equal(host.store.assignment(supplier.id).status, 'completed');
    assert.equal(host.store.assignment(root.id).status, 'ready');
    assert.equal(this.record(host, supplier.id).threadId, before.threadId);
    assert.equal(host.store.assignments(run.id).length, 2);
  }

  /** A director recommendation cannot authorize replay from an interrupted unsafe checkpoint. */
  async unsafe(t: TestContext): Promise<void> {
    const { host, run, supplier } = await this.fixture(t);
    const record = this.record(host, supplier.id);
    record.safeCheckpoint = false;
    writeFileSync(join(host.root, 'runs', record.id, 'report.json'), JSON.stringify(record));
    host.store.fail(supplier.id, 'failed', 'Uncertain operation completion');
    await host.tick();
    assert.equal(host.store.run(run.id).status, 'needs_attention');
    assert.match(String(host.store.run(run.id).data.error), /safe checkpoint|uncertain operations/);
    assert.equal(host.store.assignment(supplier.id).status, 'failed');
  }

  /** Repeated equivalent blockers require material progress instead of unlimited identical diagnosis. */
  async loop(t: TestContext): Promise<void> {
    const { host, run, supplier } = await this.fixture(t);
    for (let failure = 0; failure < 4; failure++) {
      host.store.fail(supplier.id, 'blocked', 'Equivalent unresolved dependency');
      await host.tick();
    }
    assert.equal(host.store.run(run.id).status, 'needs_attention');
    assert.match(String(host.store.run(run.id).data.error), /different action|attention/);
    const record = this.record(host, supplier.id);
    assert.equal(record.progress.warnings.length, 1);
    assert.equal(record.status, 'needs_attention');
  }

  /** A real worker cycle is diagnosed and continued without creating a replacement owner or invented delivery. */
  async cycle(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('RECOVER_CYCLE: diagnose the dependency cycle and complete the goal');
    let blocked: string | undefined;
    for (let observation = 0; observation < 30; observation++) {
      await host.tick();
      const supplier = host.store.assignments(run.id).find((a) => a.owner === 'c');
      if (supplier?.status === 'blocked') {
        blocked = supplier.id;
        assert.match(String(supplier.data.reason), /Blocking dependency cycle/);
      }
      if (host.store.run(run.id).status !== 'running') break;
    }
    assert.ok(blocked, 'The worker must actually propose a blocking cycle');
    assert.equal(
      host.store.run(run.id).status,
      'completed',
      JSON.stringify(host.store.run(run.id).data),
    );
    assert.equal(host.store.assignments(run.id).length, 3);
    assert.equal(host.store.assignment(blocked).status, 'completed');
    assert.match(
      String(host.store.assignment(blocked).data.continuationReason),
      /clarified retained scope/,
    );
  }

  /** Acceptance can wake a requester without describing its unfinished supplier as verified delivery. */
  async acceptedContext(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('Inspect accepted dependency context');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const root = host.store.enqueue(run.id, 'a', 'Research accepted intent', ['Observed']);
    host.store.updateAssignment(root.id, 'ready', { proposal: { kind: 'research' } });
    const supplier = host.store.request(root.id, {
      key: 'accepted',
      owner: 'c',
      objective: 'Supply evidence',
      acceptance: ['Observed'],
      milestone: 'accepted',
      kind: 'research',
    });
    await host.tick();
    assert.equal(host.store.assignment(root.id).status, 'ready');
    assert.notEqual(host.store.assignment(supplier.id).status, 'completed');
    await host.tick();
    const prompt = JSON.parse(readFileSync(f.calls, 'utf8').trim().split('\n').at(-1)!).prompt;
    assert.match(prompt, /accepted intent is not verified delivery/);
    assert.doesNotMatch(prompt, /Verified dependency deliveries:/);
    assert.match(prompt, /explicitly request milestone=delivered/);
  }

  /** Captures one real planned supplier activation before introducing a retained blocker. */
  private async fixture(t: TestContext, objective = 'Supplier evidence') {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('RECOVER_BLOCKED: complete the original retained goal');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const root = host.store.enqueue(run.id, 'a', 'Original goal', ['Evidence-backed result']);
    host.store.updateAssignment(root.id, 'ready', { proposal: { kind: 'research' } });
    const supplier = host.store.request(root.id, {
      key: 'supplier',
      owner: 'c',
      objective,
      acceptance: ['Evidence-backed result'],
    });
    await host.tick();
    assert.equal(this.record(host, supplier.id).nextStage, 'research');
    return { host, run, root, supplier };
  }

  /** Reads raw assignment evidence so a new assignment cannot masquerade as retained continuation. */
  private record(host: ProjectHost, id: string): any {
    const recordId = host.store.assignment(id).data.recordId;
    return JSON.parse(
      readFileSync(join(host.root, 'runs', String(recordId), 'report.json'), 'utf8'),
    );
  }
}

const scenarios = new BlockedContinuationScenarios();

test('director continuation preserves plans and required dependency delivery', (t) =>
  scenarios.safe(t));

test('director continuation cannot replay an unsafe checkpoint', (t) => scenarios.unsafe(t));

test('equivalent blocked continuations require diagnosis and material progress', (t) =>
  scenarios.loop(t));

test('worker dependency cycles can be diagnosed and continued through verified delivery', (t) =>
  scenarios.cycle(t));

test('completed worker blockers preserve safe checkpoints through director continuation', (t) =>
  scenarios.completedBlock(t));

test('accepted dependency context cannot masquerade as verified delivery', (t) =>
  scenarios.acceptedContext(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
