import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { ExecutionEvidence } from '../../../../dist/library/report/report.js';
import { ExecutionStore } from '../../../../dist/library/coordination-store/execution-store.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Protects independent dependency assessments from foreign or unverified report substitution. */
class DeliveryEvidenceScenarios {
  /** Every delivery reference must match run, assignment, parent and successful verifier identity. */
  rejects(t: TestContext, field: string): void {
    const f = new GeneralFixture(t).fixture;
    const store = new ExecutionStore(join(f.root, 'delivery.sqlite'));
    t.after(() => store.close());
    const run = store.createRun('task', ['a'], 'Verify delivery provenance');
    const assignment = store.enqueue(run.id, 'a', 'Owned work', ['Observed result']);
    const parentRecordId = randomUUID();
    store.updateAssignment(assignment.id, 'ready', { recordId: parentRecordId });
    const review = this.review(run.id, assignment.id, parentRecordId);
    const directory = join(f.state, 'runs', review.id);
    mkdirSync(directory, { recursive: true });
    const path = field === 'path' ? join(f.root, 'outside.json') : join(directory, 'report.json');
    if (field !== 'path') Object.assign(review, { [field]: 'FOREIGN_OR_UNVERIFIED' });
    writeFileSync(path, JSON.stringify(review));
    store.complete(assignment.id, [path]);
    const evidence = new ExecutionEvidence(f.state, store).capture(run.id);
    const references = (evidence.assignments[0] as any).verificationReports;
    assert.equal(references[0].evidenceUnavailable, true);
    assert.doesNotMatch(JSON.stringify(references), /FOREIGN_OR_UNVERIFIED/);
  }

  /** Constructs an otherwise valid independent assessment so each negative case changes one boundary. */
  private review(runId: string, assignmentId: string, parentRecordId: string) {
    return {
      id: randomUUID(),
      executionRunId: runId,
      assignmentId,
      parentRecordId,
      activationRole: 'verifier',
      status: 'completed',
      commands: [],
      verificationEvidence: { candidateDigest: 'observed-candidate', changes: [] },
      agent: {
        status: 'completed',
        criteria: [{ index: 0, verdict: 'verified', evidence: ['Observed'] }],
        deficiencies: [],
      },
    };
  }
}

const scenarios = new DeliveryEvidenceScenarios();

for (const field of [
  'executionRunId',
  'assignmentId',
  'parentRecordId',
  'activationRole',
  'status',
  'path',
])
  test('delivery evidence rejects mismatched ' + field, (t) => scenarios.rejects(t, field));

registerSuite({ component: 'report', level: 'acceptance', tags: ['deterministic'] });
