import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { CandidateSnapshots } from '../../../../dist/library/workspace/candidates.js';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Verifies snapshot and reconciliation behavior against real disposable Git repositories. */
class CandidateScenarios {
  /** Preserves source HEAD/index and retains three-way conflicts without overwriting files. */
  snapshots(t: TestContext): void {
    const f = workflowFixture(t);
    const base = f.git('rev-parse', 'HEAD');
    const snapshots = new CandidateSnapshots(f.repo, join(f.root, 'snapshots'));
    writeFileSync(join(f.repo, 'source.txt'), 'left');
    const left = snapshots.capture(f.repo, base);
    assert.equal(f.git('rev-parse', 'HEAD'), base);
    assert.equal(f.git('diff', '--cached'), '');
    writeFileSync(join(f.repo, 'source.txt'), 'right');
    const right = snapshots.capture(f.repo, base);
    const conflict = snapshots.reconcile(base, left, right);
    assert.equal(conflict.status, 'conflict');
    assert.equal(readFileSync(join(f.repo, 'source.txt'), 'utf8'), 'right');
    writeFileSync(join(f.repo, 'source.txt'), 'before');
    writeFileSync(join(f.repo, 'docs/behavior.md'), 'new documentation');
    const independent = snapshots.capture(f.repo, base);
    const merged = snapshots.reconcile(base, left, independent);
    assert.equal(merged.status, 'merged');
    if (merged.status !== 'merged') throw new Error('Expected merge');
    assert.equal(f.git('show', merged.revision + ':source.txt'), 'left');
    assert.equal(f.git('show', merged.revision + ':docs/behavior.md'), 'new documentation');
  }
}

const scenarios = new CandidateScenarios();

test('candidate snapshots isolate edits and report merge conflicts without source mutations', (t) =>
  scenarios.snapshots(t));

registerSuite({ component: 'workspace', level: 'acceptance', tags: ['deterministic'] });
