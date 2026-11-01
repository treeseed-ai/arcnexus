import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises qualification behavior through observable scenarios. */
class QualificationTests {
  /** Verifies that independent report checker still executes when its snapshot path contains spaces. */
  independentReportCheckerStillExecutesWhenItsSnapshotPathContainsSpaces(t: TestContext) {
    const f = workflowFixture(t),
      script = join(f.root, 'report check.mjs');
    writeFileSync(script, readFileSync('dist/library/experiments/checks/check-report-summary.js'));
    mkdirSync(join(f.repo, 'dist/library/report'), { recursive: true });
    writeFileSync(
      join(f.repo, 'dist/library/report/report.js'),
      "export function markdownReport(){return 'fixture without outcome'}",
    );
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: f.repo });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OUTCOME_SECTION_REQUIRED/);
  }
}

const suite = new QualificationTests();

test('independent report checker still executes when its snapshot path contains spaces', (t: any) =>
  suite.independentReportCheckerStillExecutesWhenItsSnapshotPathContainsSpaces(t));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
