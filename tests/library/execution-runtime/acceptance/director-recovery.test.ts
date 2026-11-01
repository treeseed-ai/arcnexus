import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Requires the director to address uncovered goal criteria without discarding verified owner work. */
class DirectorRecoveryScenarios {
  /** A failed final assessment creates additional bounded work and reassesses the original goal. */
  async coverage(t: TestContext): Promise<void> {
    const host = this.host(t);
    const task = host.submit('REPLAN_GOAL: research evidence with full goal coverage');
    for (let observation = 0; observation < 30; observation++) {
      await host.tick();
      if (host.store.run(task.id).status !== 'running') break;
    }
    const run = host.store.run(task.id);
    assert.equal(run.status, 'completed', JSON.stringify(run.data.error));
    const assignments = host.store.assignments(task.id);
    assert.equal(assignments.length, 4);
    assert.equal(assignments.filter((a) => a.owner === 'c').length, 2);
    assert.ok(assignments.every((a) => a.status === 'completed'));
    assert.ok(Array.isArray(run.data.directionHistory));
    assert.ok(run.data.goalEvidence);
    assert.equal(run.objective, task.objective);
  }

  /** Blocked work receives director diagnosis and a substantive question without fabricated delivery. */
  async diagnosis(t: TestContext): Promise<void> {
    const host = this.host(t);
    const task = host.submit('Diagnose unresolved authority');
    host.store.updateRun(task.id, 'running', { initialized: true });
    const assignment = host.store.enqueue(task.id, 'a', 'Needs an architectural decision');
    host.store.fail(assignment.id, 'blocked', 'Unknown owner');
    await host.tick();
    const run = host.store.run(task.id);
    assert.equal(run.status, 'needs_input');
    assert.ok((run.data.questions as string[]).length > 0);
    assert.equal(host.store.assignment(assignment.id).status, 'blocked');
    assert.equal(host.store.assignments(task.id).length, 1);
  }

  /** Captures the ordinary package and uses production direction and assignment wiring. */
  private host(t: TestContext): ProjectHost {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    return host;
  }
}

const scenarios = new DirectorRecoveryScenarios();

test('director repairs missing goal coverage with additional verified assignments', (t) =>
  scenarios.coverage(t));

test('director diagnoses blocked work without claiming its delivery', (t) =>
  scenarios.diagnosis(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
