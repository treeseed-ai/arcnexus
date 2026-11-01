import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';

/** Exercises check layout behavior through observable scenarios. */
class CheckLayoutTests {
  /** Builds a candidate layout fixture and runs the independent checker against its report module. */
  report(t: TestContext, layout: string, check: string): void {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-check-layout-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, layout), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    const implementation = pathToFileURL(resolve('dist/library/report/report.js')).href;
    writeFileSync(
      join(root, layout, 'report.js'),
      `export * from ${JSON.stringify(implementation)};`,
    );
    const result = spawnSync(
      process.execPath,
      [resolve('dist/library/experiments/checks', check)],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /acceptance passed|INDEPENDENT_REPORT_OPERATIONS_PASSED/);
  }
}

const suite = new CheckLayoutTests();

for (const layout of ['dist', 'dist/report', 'dist/library/report'])
  for (const check of ['check-report.js', 'check-report-summary.js', 'report-operations.js'])
    test(`independent ${check} supports ${layout} target layout`, (t) =>
      suite.report(t, layout, check));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
