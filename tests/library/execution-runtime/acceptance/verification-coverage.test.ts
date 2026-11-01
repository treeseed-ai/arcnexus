import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises independent criterion coverage through the production assignment and SDK boundaries. */
class VerificationCoverageScenarios {
  /** A completed verifier claim cannot promote work with missing or malformed criterion evidence. */
  async rejects(t: TestContext, marker: string): Promise<void> {
    const { host, assignment, run } = this.fixture(t, marker);
    for (let observation = 0; observation < 12; observation++) {
      await host.tick();
      const record = this.record(host, assignment.id);
      if (
        record?.independentFindings ||
        host.store.assignment(assignment.id).status === 'completed'
      )
        break;
    }
    assert.notEqual(host.store.assignment(assignment.id).status, 'completed');
    assert.ok(this.record(host, assignment.id)?.independentFindings);
    assert.equal(host.store.run(run.id).data.verifiedEvidence, undefined);
  }

  /** Complete indexed evidence remains sufficient for delivery and independent whole-goal assessment. */
  async accepts(t: TestContext): Promise<void> {
    const { host, run } = this.fixture(t, 'VERIFY_COMPLETE');
    for (let observation = 0; observation < 12; observation++) {
      await host.tick();
      if (host.store.run(run.id).status !== 'running') break;
    }
    assert.equal(host.store.run(run.id).status, 'completed');
    const evidence = host.store.run(run.id).data.goalEvidence as string[];
    const record = JSON.parse(readFileSync(evidence[0]!, 'utf8'));
    assert.equal(record.agent.criteria.length, 3);
    assert.equal(record.acceptanceCriteria[0], run.objective);
  }

  /** Seeds a two-criterion assignment without bypassing worker planning, checks or independent review. */
  private fixture(t: TestContext, marker: string) {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit(marker + ': Establish complete evidence');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const assignment = host.store.enqueue(run.id, 'c', marker, [
      'First criterion',
      'Second criterion',
    ]);
    host.store.updateAssignment(assignment.id, 'ready', { proposal: { kind: 'research' } });
    return { host, assignment, run };
  }

  /** Reads independently retained assessment findings rather than inferring success from a model summary. */
  private record(host: ProjectHost, id: string): any {
    const recordId = host.store.assignment(id).data.recordId;
    if (!recordId) return undefined;
    return JSON.parse(
      readFileSync(join(host.root, 'runs', String(recordId), 'report.json'), 'utf8'),
    );
  }
}

const scenarios = new VerificationCoverageScenarios();

for (const marker of ['VERIFY_OMIT', 'VERIFY_DUPLICATE', 'VERIFY_UNKNOWN', 'VERIFY_GAP'])
  test('independent verification rejects ' + marker, (t) => scenarios.rejects(t, marker));

test('independent verification requires complete owner and original-goal coverage', (t) =>
  scenarios.accepts(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
