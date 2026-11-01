import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
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

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
