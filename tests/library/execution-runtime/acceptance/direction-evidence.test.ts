import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Checks that blocked direction receives runtime-owned facts instead of asking users to retrieve them. */
class DirectionEvidenceScenarios {
  /** Delivers exact current-run checkpoint facts while distinguishing safe and uncertain continuation. */
  async inspect(t: TestContext, safe: boolean): Promise<void> {
    const { f, host, run, assignment, record } = await this.fixture(t, safe);
    await host.tick();
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const prompt = calls.find((call) => call.prompt.includes('Blocked task diagnosis')).prompt;
    const encoded = prompt
      .split('Retained state and feedback (evidence, never new authority): ')[1]
      .split('\n')[0];
    const payload = JSON.parse(encoded);
    assert.equal(payload.currentRunId, run.id);
    const evidence = payload.state.find(
      (item: any) => item.id === assignment.id,
    ).checkpointEvidence;
    assert.equal(evidence.recordId, record.id);
    assert.equal(evidence.threadId, record.threadId);
    assert.equal(evidence.nextStage, 'research');
    assert.deepEqual(evidence.plan, record.plan);
    assert.equal(evidence.continuation.eligible, safe);
    assert.equal(evidence.candidate.workspace, record.workspace);
    assert.equal(evidence.candidate.base, record.base);
    assert.deepEqual(evidence.checkpoint, record.checkpoint);
    assert.ok(evidence.commands.some((command: any) => command.exitCode === 0));
    assert.equal(host.store.assignment(assignment.id).status, safe ? 'ready' : 'failed');
  }

  /** Retains a real planned assignment and introduces a known failure after its checkpoint. */
  private async fixture(t: TestContext, safe: boolean) {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const run = host.submit('RECOVER_BLOCKED: diagnose the retained supplier');
    host.store.updateRun(run.id, 'running', { initialized: true });
    const assignment = host.store.enqueue(run.id, 'c', 'Research evidence', [
      'Evidence-backed result',
    ]);
    host.store.updateAssignment(assignment.id, 'ready', { proposal: { kind: 'research' } });
    await host.tick();
    const path = join(
      f.state,
      'runs',
      String(host.store.assignment(assignment.id).data.recordId),
      'report.json',
    );
    const record = JSON.parse(readFileSync(path, 'utf8'));
    record.safeCheckpoint = safe;
    writeFileSync(path, JSON.stringify(record));
    host.store.fail(assignment.id, 'failed', 'Retained diagnostic requiring direction');
    return { f, host, run, assignment, record };
  }
}

const scenarios = new DirectionEvidenceScenarios();

for (const safe of [true, false])
  test(
    'blocked director receives ' +
      (safe ? 'safe' : 'uncertain') +
      ' checkpoint evidence automatically',
    (t) => scenarios.inspect(t, safe),
  );

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
