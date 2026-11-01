import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises independent review loops through real activation, check and retained-state boundaries. */
class VerificationProgressScenarios {
  /** Different reviewer wording cannot keep the same unverified candidate runnable indefinitely. */
  async repeated(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('Observe repeated independent verification gaps');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const assignment = host.store.enqueue(run.id, 'c', 'REPEATED_REVIEW_GAP', ['Observed result']);
    host.store.updateAssignment(assignment.id, 'ready', { proposal: { kind: 'research' } });
    for (
      let activation = 0;
      activation < 16 && host.store.assignment(assignment.id).status === 'ready';
      activation++
    )
      await host.tick();
    const final = host.store.assignment(assignment.id);
    const record = JSON.parse(
      readFileSync(join(f.state, 'runs', String(final.data.recordId), 'report.json'), 'utf8'),
    );
    assert.equal(
      record.status,
      'needs_attention',
      'Paraphrased gaps on unchanged evidence must stop',
    );
    assert.equal(final.status, 'failed');
    assert.equal(record.independentProgress.warnings.length, 1);
    assert.equal(record.independentProgress.warnings[0].count, 3);
    assert.match(record.correctiveFeedback, /Three equivalent failed actions/);
    assert.deepEqual(final.evidence, []);
    assert.equal(host.store.run(run.id).data.candidateRevision, host.context.base);
  }
}

const scenarios = new VerificationProgressScenarios();

test('equivalent independent verification gaps require diagnosis despite changing prose', (t) =>
  scenarios.repeated(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
