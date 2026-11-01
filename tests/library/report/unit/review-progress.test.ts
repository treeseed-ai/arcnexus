import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ProgressObserver } from '../../../../dist/library/report/progress.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Separates review-loop progress from unrelated verification and candidate evolution. */
class ReviewProgressScenarios {
  /** Passing another checkpoint does not erase review gaps, while a changed candidate gets its own assessment. */
  isolated(t: TestContext): void {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-review-progress-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'runs', 'record'), { recursive: true });
    const record = { id: 'record', status: 'running' } as RecordData;
    const review = new ProgressObserver(root, record, 'independentProgress');
    const checks = new ProgressObserver(root, record);
    for (const checkpoint of ['first', 'second']) {
      assert.equal(review.failed('review', 'criterion 0', 'unchanged'), undefined);
      checks.verified(checkpoint);
    }
    assert.match(review.failed('review', 'criterion 0', 'unchanged')!, /Three equivalent/);
    checks.verified('another passing check');
    assert.equal(review.failed('review', 'criterion 0', 'materially changed'), undefined);
    assert.throws(() => review.failed('review', 'criterion 0', 'unchanged'), /different action/);
    assert.equal(record.status, 'needs_attention');
  }
}

const scenarios = new ReviewProgressScenarios();

test('independent review failure history survives unrelated checkpoints and distinguishes candidates', (t) =>
  scenarios.isolated(t));

registerSuite({ component: 'report', level: 'unit', tags: ['deterministic'] });
