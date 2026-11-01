import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExecutionEvidence } from '../../../../dist/library/report/report.js';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Verifies dynamic delegation with host-owned chronology rather than worker descriptions. */
class CoordinationEvidenceScenarios {
  /** The actual verifier tool exposes request-before-work ordering and candidate provenance for this run. */
  async chronology(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    const host = new ProjectHost(f.state, context);
    t.after(() => host.store.close());
    const run = host.submit('READ_HOST_EVIDENCE: verify dynamically discovered dependency work');
    for (
      let activation = 0;
      activation < 30 && host.store.run(run.id).status === 'running';
      activation++
    )
      await host.tick();
    assert.equal(host.store.run(run.id).status, 'completed');
    const trace = JSON.parse(
      readFileSync(f.calls + '.evidence', 'utf8')
        .trim()
        .split('\n')
        .at(-1)!,
    );
    assert.ok(trace.artifacts.execution, 'Verifier needs pinned coordination evidence');
    const execution = JSON.parse(trace.artifacts.execution);
    assert.equal(execution.run.id, run.id);
    assert.equal(execution.run.authorityBase, context.base);
    assert.equal(execution.run.initialCandidateRevision, context.base);
    assert.equal(execution.requests.length, 2);
    assert.equal(execution.source.head, context.base);
    assert.equal(execution.source.status, '');
    this.requestsPrecedeWork(execution);
  }

  /** A foreign record reference cannot substitute another task's observations or disclose its contents. */
  foreign(t: TestContext): void {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('Current goal');
    const current = host.store.enqueue(run.id, 'a', 'Current assignment');
    this.foreignReference(host, current.id);
    const evidence = new ExecutionEvidence(f.state, host.store).capture(run.id);
    assert.equal((evidence.assignments[0]!.record as any).evidenceUnavailable, true);
    assert.doesNotMatch(
      JSON.stringify(evidence),
      /FOREIGN_PRIVATE_EVIDENCE|Foreign work|Foreign goal/,
    );
    assert.equal(evidence.requests.length, 0);
  }

  /** Injects a mismatched private record pointer to exercise the report's identity boundary. */
  private foreignReference(host: ProjectHost, assignmentId: string): void {
    const other = host.store.createRun('task', ['a', 'b', 'c'], 'Foreign goal');
    const foreign = host.store.enqueue(other.id, 'a', 'Foreign assignment');
    host.store.request(foreign.id, {
      key: 'foreign',
      owner: 'b',
      objective: 'Foreign work',
      acceptance: [],
    });
    const recordId = randomUUID();
    mkdirSync(join(host.root, 'runs', recordId));
    writeFileSync(
      join(host.root, 'runs', recordId, 'report.json'),
      JSON.stringify({
        id: recordId,
        executionRunId: other.id,
        assignmentId: foreign.id,
        commands: ['FOREIGN_PRIVATE_EVIDENCE'],
      }),
    );
    host.store.updateAssignment(assignmentId, 'ready', { recordId });
  }

  /** Compares persisted request timestamps with actual consuming activation boundaries. */
  private requestsPrecedeWork(execution: any): void {
    for (const request of execution.requests) {
      const event = execution.events.find(
        (event: any) => event.type === 'requests.delivered' && event.data.from === request.from,
      );
      const sender = execution.assignments.find(
        (assignment: any) => assignment.id === request.from,
      );
      const work = sender.record.turns.find((turn: any) => turn.activity === 'research');
      assert.ok(event && work);
      assert.ok(
        event.observed_at <= work.startedAt,
        'Persisted request must precede consuming work',
      );
    }
  }
}

const scenarios = new CoordinationEvidenceScenarios();

test('independent verification receives current-run request chronology and candidate provenance', (t) =>
  scenarios.chronology(t));

test('host verification projections exclude foreign run records and coordination', (t) =>
  scenarios.foreign(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
