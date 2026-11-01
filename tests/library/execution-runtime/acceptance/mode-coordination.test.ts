import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises competing lifecycle requests while a real managed harness process is active. */
class ModeCoordinationScenarios {
  /** Records pausing immediately, preserves a completed checkpoint and honors intervening user pause. */
  async pauseAndTasks(t: TestContext): Promise<void> {
    const { host, gate, run, assignment } = this.fixture(t);
    const active = host.tick();
    try {
      await this.entered(gate);
      const first = host.submit('First queued task');
      const second = host.submit('Second queued task');
      assert.equal(host.store.run(run.id).status, 'pausing');
      host.control('pause');
      writeFileSync(gate, 'release');
      await active;
      this.checkpoint(host, assignment.id);
      await this.queuedTasks(host, first.id, second.id);
      assert.equal(host.store.run(run.id).status, 'paused');
      assert.equal(host.store.run(run.id).data.pauseReason, 'user');
    } finally {
      host.control('stop');
      await active;
    }
  }

  /** Checks the retained engineering plan and next stage independently of lifecycle projections. */
  private checkpoint(host: ProjectHost, id: string): void {
    const retained = host.store.assignment(id);
    const path = join(host.root, 'runs', String(retained.data.recordId), 'report.json');
    const record = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(record.safeCheckpoint, true);
    assert.equal(record.nextStage, 'research');
    assert.ok(record.plan);
  }

  /** Queued tasks take execution in order and release it after cancellation. */
  private async queuedTasks(host: ProjectHost, first: string, second: string): Promise<void> {
    await host.tick();
    assert.ok(host.store.assignments(first).length);
    assert.equal(host.store.assignments(second).length, 0);
    host.cancel(first);
    await host.tick();
    assert.ok(host.store.assignments(second).length);
    host.cancel(second);
    await host.tick();
  }

  /** Stop cancels the owned process without requiring the blocked turn to reach its voluntary checkpoint. */
  async stop(t: TestContext): Promise<void> {
    const { host, gate, run, assignment } = this.fixture(t);
    const active = host.tick();
    try {
      await this.entered(gate);
      const pid = Number(readFileSync(gate + '.entered', 'utf8'));
      host.control('stop');
      assert.equal(host.store.run(run.id).status, 'stopping');
      await active;
      assert.equal(host.store.run(run.id).status, 'stopped');
      assert.throws(() => process.kill(pid, 0), /ESRCH/);
      assert.notEqual(host.store.assignment(assignment.id).status, 'completed');
      assert.ok(host.store.assignment(assignment.id).data.recordId);
    } finally {
      host.control('stop');
      await active;
    }
  }

  /** Captures an isolated package and a single research assignment with a controllable model turn. */
  private fixture(t: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), 'arcnexus-mode-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const gate = join(directory, 'release');
    const f = new GeneralFixture(t, gate).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    host.control('start');
    const run = host.store.runs()[0]!;
    const assignment = host.store.enqueue(run.id, 'c', 'Research evidence', [
      'Evidence-backed result',
    ]);
    host.store.updateAssignment(assignment.id, 'ready', { proposal: { kind: 'research' } });
    return { host, gate, run, assignment };
  }

  /** Bounds test observation only; the managed application has no work deadline. */
  private async entered(gate: string): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt++) {
      if (existsSync(gate + '.entered')) return;
      await delay(25);
    }
    assert.fail('Managed turn did not reach the test checkpoint');
  }
}

const scenarios = new ModeCoordinationScenarios();

test('queued tasks pause active work safely and preserve intervening user intent', (t) =>
  scenarios.pauseAndTasks(t));

test('workday stop promptly cancels an active managed turn', (t) => scenarios.stop(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
