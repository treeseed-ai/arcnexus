import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { ExecutionEvidence } from '../../../../dist/library/report/report.js';
import { observe } from '../../../../dist/library/report/timeline.js';
import { ExecutionStore } from '../../../../dist/library/coordination-store/execution-store.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Checks private observation boundaries without treating omitted evidence as successful verification. */
class ExecutionObservationScenarios {
  /** A truncated observation retains earlier events and marks incompleteness; outside logs remain unread. */
  partial(t: TestContext): void {
    const { f, store, run, record, directory } = this.fixture(t);
    const outside = join(f.root, 'private.log');
    writeFileSync(outside, 'OUTSIDE_PRIVATE_OUTPUT');
    const inside = join(directory, 'command-1.log');
    writeFileSync(inside, 'Observed host output');
    record.commands = [outside, inside].map((log) => ({ command: 'node', args: [], log })) as any;
    writeFileSync(join(directory, 'report.json'), JSON.stringify(record));
    observe(f.state, record, 'codex.event', {
      type: 'item.completed',
      item: { type: 'command_execution', aggregated_output: 'Observed' },
    });
    appendFileSync(join(directory, 'timeline.jsonl'), '{"partial":');
    const evidence = new ExecutionEvidence(f.state, store).capture(run.id);
    const observations = (evidence.assignments[0]!.record as any).observations;
    assert.equal(observations.timeline.complete, false);
    assert.equal(observations.timeline.events.length, 1);
    assert.equal(observations.hostCommands[0].output.evidenceUnavailable, true);
    assert.equal(observations.hostCommands[1].output.content, 'Observed host output');
    assert.doesNotMatch(JSON.stringify(evidence), /OUTSIDE_PRIVATE_OUTPUT/);
  }

  /** A foreign timeline cannot be presented as observations from a matching assignment report. */
  foreign(t: TestContext): void {
    const { f, store, run, record, directory } = this.fixture(t);
    observe(f.state, record, 'codex.event', {
      type: 'item.completed',
      item: { type: 'command_execution' },
    });
    const event = {
      schemaVersion: 1,
      sequence: 1,
      runId: randomUUID(),
      payload: 'FOREIGN_TIMELINE',
    };
    writeFileSync(join(directory, 'timeline.jsonl'), JSON.stringify(event) + '\n');
    const evidence = new ExecutionEvidence(f.state, store).capture(run.id);
    assert.equal((evidence.assignments[0]!.record as any).evidenceUnavailable, true);
    assert.doesNotMatch(JSON.stringify(evidence), /FOREIGN_TIMELINE/);
  }

  /** Registers a matching host-owned assignment record in a private durable store. */
  private fixture(t: TestContext) {
    const f = new GeneralFixture(t).fixture;
    const store = new ExecutionStore(join(f.root, 'observations.sqlite'));
    t.after(() => store.close());
    const run = store.createRun('task', ['a'], 'Observe existing evidence');
    const assignment = store.enqueue(run.id, 'a', 'Inspect API');
    const id = randomUUID();
    const record = {
      id,
      executionRunId: run.id,
      assignmentId: assignment.id,
      commands: [],
    } as unknown as RecordData;
    const directory = join(f.state, 'runs', id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'report.json'), JSON.stringify(record));
    store.updateAssignment(assignment.id, 'ready', { recordId: id });
    return { f, store, run, record, directory };
  }
}

const scenarios = new ExecutionObservationScenarios();

test('partial tool observations and inaccessible command output remain explicit evidence gaps', (t) =>
  scenarios.partial(t));

test('independent evidence rejects a foreign assignment timeline', (t) => scenarios.foreign(t));

registerSuite({ component: 'report', level: 'acceptance', tags: ['deterministic'] });
