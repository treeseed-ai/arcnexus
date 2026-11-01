import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises corrective planning at the real assignment boundary without waiving acceptance criteria. */
class PlanningRecoveryScenarios {
  /** An omitted criterion returns feedback to the same assignment and model thread. */
  async correct(t: TestContext): Promise<void> {
    const { host, assignment } = this.fixture(t, 2);
    await host.tick();
    assert.equal(host.store.assignment(assignment.id).status, 'ready');
    const before = this.record(host, assignment.id);
    assert.equal(before.nextStage ?? 'planning', 'planning');
    assert.match(before.planningFeedback, /Plan omits acceptance criterion/);
    assert.equal(before.safeCheckpoint, true);
    await host.tick();
    const after = this.record(host, assignment.id);
    assert.equal(after.id, before.id);
    assert.equal(after.threadId, before.threadId);
    assert.equal(after.nextStage, 'research');
    assert.deepEqual(after.plan.items[0].criteria, [0, 1]);
    assert.equal(after.planningFeedback, undefined);
  }

  /** Repeated invalid planning remains an honest failure instead of completing an incomplete checklist. */
  async loop(t: TestContext): Promise<void> {
    const { host, assignment } = this.fixture(t, 3);
    for (let observation = 0; observation < 8; observation++) {
      await host.tick();
      if (host.store.assignment(assignment.id).status === 'failed') break;
    }
    const record = this.record(host, assignment.id);
    assert.equal(record.status, 'needs_attention');
    assert.equal(record.plan, undefined);
    assert.equal(record.progress.warnings.length, 1);
    assert.match(String(host.store.assignment(assignment.id).data.reason), /Loop requires/);
  }

  /** Supplies a captured task with more criteria than the controlled worker's first plan covers. */
  private fixture(t: TestContext, count: number) {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('Research all acceptance criteria');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const criteria = Array.from({ length: count }, (_, index) => `Observed criterion ${index}`);
    const assignment = host.store.enqueue(run.id, 'c', 'Research evidence', criteria);
    host.store.updateAssignment(assignment.id, 'ready', { proposal: { kind: 'research' } });
    return { host, assignment };
  }

  /** Reads retained host evidence rather than accepting the controlled worker's claims. */
  private record(host: ProjectHost, id: string): any {
    const recordId = host.store.assignment(id).data.recordId;
    return JSON.parse(
      readFileSync(join(host.root, 'runs', String(recordId), 'report.json'), 'utf8'),
    );
  }
}

const scenarios = new PlanningRecoveryScenarios();

test('general planning corrects missing criterion coverage on the retained thread', (t) =>
  scenarios.correct(t));

test('equivalent planning failures require diagnosis without weakening acceptance', (t) =>
  scenarios.loop(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
