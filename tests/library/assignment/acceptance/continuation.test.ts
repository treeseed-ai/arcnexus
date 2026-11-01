import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { resolveAssignment } from '../../../../dist/library/architecture/assignment.js';
import { StewardSession } from '../../../../dist/library/assignment/steward.js';
import { createWorkspace } from '../../../../dist/library/workspace/workspace.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Reconstructs sessions between real SDK-boundary turns against a controlled executable. */
class ContinuationScenarios {
  /** Ensures reopening neither reruns specification nor loses frozen evidence or thread continuity. */
  async resume(t: TestContext): Promise<void> {
    const f = workflowFixture(t);
    this.prepareState(f.state);
    let record = createWorkspace(f.state, { project: f.repo });
    record.resolvedAssignment = resolveAssignment(f.repo, record.base, 'sample', {
      objective: 'Improve behavior',
    });
    const stages: unknown[] = [];
    for (let index = 0; index < 4; index++) {
      const session = new StewardSession(
        f.state,
        record,
        'sample',
        'Improve behavior',
        'gpt-6-luna',
        f.executable,
        new AbortController().signal,
      );
      await session.step();
      stages.push(record.nextStage);
      record = JSON.parse(
        readFileSync(join(f.state, 'runs', record.id, 'report.json'), 'utf8'),
      ) as RecordData;
    }
    this.assertCompleted(record, stages);
  }

  /** Requires passing characterization before and after a refactor without fabricated specification edits. */
  async refactor(t: TestContext): Promise<void> {
    const f = workflowFixture(t);
    writeFileSync(
      join(f.repo, 'tests/baseline.cjs'),
      "require('node:assert/strict').equal(require('node:fs').readFileSync('source.txt','utf8').trim(),'before');",
    );
    writeFileSync(join(f.repo, 'verify.cjs'), "require('./tests/baseline.cjs');");
    f.configure({ refactor: true });
    f.commit();
    this.prepareState(f.state);
    const record = createWorkspace(f.state, { project: f.repo });
    this.refactorAuthority(record, f.repo);
    record.directionAccepted = true;
    for (let stage = 0; stage < 4; stage++)
      await new StewardSession(
        f.state,
        record,
        'sample',
        'Normalize whitespace',
        'gpt-6-luna',
        f.executable,
        new AbortController().signal,
      ).step();
    this.assertRefactor(record);
  }

  /** Checks distinct before/after characterization evidence and unchanged documentation. */
  private assertRefactor(record: RecordData): void {
    assert.equal(record.status, 'completed');
    assert.equal(record.characterization, true);
    assert.equal(record.regressionCheckpoint, undefined);
    assert.ok(
      record.commands.some((c) => c.stage === 'characterization-before' && c.exitCode === 0),
    );
    assert.ok(
      record.commands.some((c) => c.stage === 'characterization-after' && c.exitCode === 0),
    );
    assert.equal(readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'), 'Before');
  }

  /** Captures the unchanged behavioral contract before any refactor stage. */
  private refactorAuthority(record: RecordData, repository: string): void {
    record.resolvedAssignment = resolveAssignment(repository, record.base, 'sample', {
      value: {
        schemaVersion: 3,
        kind: 'change',
        changeType: 'refactor',
        objective: 'Normalize whitespace',
        expectedOutcome: 'Preserve trimmed value',
        acceptanceCriteria: ['Trimmed value remains before'],
        hostChecks: [],
      },
    });
  }

  /** Checks retained engineering evidence and the actual candidate after reopening. */
  private assertCompleted(record: RecordData, stages: unknown[]): void {
    assert.equal(record.status, 'completed');
    assert.deepEqual(stages, ['specification', 'implementation', 'review', 'finished']);
    assert.equal(record.implementationAttempts, 1);
    assert.equal((record.turns as unknown[]).length, 3);
    assert.ok((record.frozenTests as unknown[]).length);
    assert.equal(readFileSync(join(record.workspace, 'source.txt'), 'utf8'), 'after');
  }

  /** Establishes the state directories normally created by the CLI entry point. */
  private prepareState(root: string): void {
    for (const name of ['runs', 'workspaces']) mkdirSync(join(root, name), { recursive: true });
  }
}

const scenarios = new ContinuationScenarios();

test('built steward resumes persisted stages without resetting evidence', (t) =>
  scenarios.resume(t));

test('refactor retains passing characterization without changed specification', (t) =>
  scenarios.refactor(t));

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
