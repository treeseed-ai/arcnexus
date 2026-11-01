import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import type { RunStatus } from '../../../../dist/library/coordination-store/execution-types.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises late controls and restart authority without changing retained qualification evidence. */
class ControlAuthorityScenarios {
  /** Late and duplicate cancellation preserve terminal task state, evidence and ordered events. */
  terminal(t: TestContext, status: RunStatus): void {
    const { host } = this.fixture(t);
    const task = host.submit('Retained task outcome');
    host.store.updateRun(task.id, status, { goalEvidence: ['retained-assessment'] });
    const before = host.store.run(task.id);
    const events = host.store.events();
    host.cancel(task.id);
    host.cancel(task.id);
    assert.deepEqual(host.store.run(task.id), before);
    assert.deepEqual(host.store.events(), events);
  }

  /** Queued and input-waiting tasks remain cancellable without duplicating the terminal transition. */
  cancellable(t: TestContext, status: RunStatus): void {
    const { host } = this.fixture(t);
    const task = host.submit('Cancellable task');
    host.store.updateRun(task.id, status);
    host.cancel(task.id);
    assert.equal(host.store.run(task.id).status, 'cancelled');
    const events = host.store.events();
    host.cancel(task.id);
    assert.deepEqual(host.store.events(), events);
  }

  /** Reopening under different or unknown authority cannot replace the old candidate or resume dispatch. */
  changed(t: TestContext, mode: 'source' | 'bindings' | 'missing' | 'package'): void {
    const { f, host } = this.fixture(t);
    host.control('start');
    host.control('pause');
    const run = host.store.runs()[0]!;
    if (mode === 'missing') host.store.updateRun(run.id, 'paused', { executionIdentity: null });
    host.store.close();
    this.change(f, mode);
    const context = new ExecutionContext().resolve(f.repo);
    if (mode === 'package') context.packageId = 'another-package';
    const reopened = new ProjectHost(f.state, context);
    t.after(() => reopened.store.close());
    assert.throws(() => reopened.control('resume'), /authority|attention/i);
    const retained = reopened.store.run(run.id);
    assert.equal(retained.status, 'needs_attention');
    const projected = reopened.status().workday?.data as Record<string, unknown>;
    assert.match(String(projected.authorityError), /authority/);
    assert.equal(retained.data.authorityBase, run.data.authorityBase);
    assert.equal(retained.data.candidateRevision, run.data.candidateRevision);
    assert.equal(existsSync(f.calls), false);
  }

  /** An unchanged authority resumes; source drift cannot silently alter an already captured host. */
  unchanged(t: TestContext, drift: boolean): void {
    const { f, host } = this.fixture(t);
    host.control('start');
    host.control('pause');
    const run = host.store.runs()[0]!;
    if (drift) {
      this.change(f, 'source');
      host.control('resume');
      assert.equal(host.status().sourceChanged, true);
      assert.equal(host.store.run(run.id).data.candidateRevision, run.data.candidateRevision);
    } else {
      host.store.close();
      const reopened = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
      t.after(() => reopened.store.close());
      reopened.control('resume');
      assert.equal(reopened.store.run(run.id).status, 'running');
      assert.equal(reopened.store.run(run.id).data.candidateRevision, run.data.candidateRevision);
    }
  }

  /** Supplies a clean package and closes each disposable store even when assertions fail. */
  private fixture(t: TestContext) {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => {
      try {
        host.store.close();
      } catch {}
    });
    return { f, host };
  }

  /** Changes only the selected external authority input before constructing a replacement host. */
  private change(f: GeneralFixture['fixture'], mode: string): void {
    if (mode === 'source') {
      writeFileSync(join(f.repo, 'source.txt'), 'new source revision');
      f.commit();
    } else if (mode === 'bindings') {
      const path = join(f.repo, '.git/arcnexus/bindings.yaml');
      const value = JSON.parse(readFileSync(path, 'utf8'));
      value.tools.node = process.execPath;
      writeFileSync(path, JSON.stringify(value));
    }
  }
}

const scenarios = new ControlAuthorityScenarios();

for (const status of [
  'completed',
  'cancelled',
  'interrupted',
  'failed',
  'needs_attention',
] as const)
  test(`late cancellation preserves ${status} task outcome`, (t) => scenarios.terminal(t, status));

for (const status of ['running', 'needs_input'] as const)
  test(`cancellation of ${status} task is idempotent`, (t) => scenarios.cancellable(t, status));

for (const mode of ['source', 'bindings', 'missing', 'package'] as const)
  test(`recovery rejects changed ${mode} authority without importing it`, (t) =>
    scenarios.changed(t, mode));

test('unchanged captured authority permits safe workday recovery', (t) =>
  scenarios.unchanged(t, false));

test('a captured host does not import observed source drift', (t) => scenarios.unchanged(t, true));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
