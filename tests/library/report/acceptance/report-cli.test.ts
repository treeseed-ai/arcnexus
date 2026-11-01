import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { markdownReport as typedMarkdownReport } from '../../../../dist/library/report/report.js';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

const markdownReport: (record: any) => string = typedMarkdownReport;

const record = {
  id: 'execution',
  status: 'failed',
  objective: 'Improve report',
  workspace: '/captured',
  base: 'abc',
  error: 'failure evidence',
  commands: [{}],
};

const section = (report: string) => report.split('## Changed files\n\n')[1]?.split('\n\n')[0];

/** Exercises report cli behavior through observable scenarios. */
class ReportCliTests {
  /** Verifies that built clirun renders observed changes from the production workflow. */
  builtCLIRunRendersObservedChangesFromTheProductionWorkflow(t: TestContext) {
    const f = workflowFixture(t),
      result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const captured = JSON.parse(result.stdout),
      run = join(f.state, 'runs', captured.id);
    const evidence = JSON.parse(String(readFileSync(join(run, 'report.json'), 'utf8')));
    assert.deepEqual(evidence.changes, [
      { kind: 'M', path: 'docs/behavior.md' },
      { kind: 'M', path: 'source.txt' },
      { path: 'tests/regression.cjs', kind: '?' },
    ]);
    assert.equal(
      section(readFileSync(join(run, 'report.md'), 'utf8')),
      '- <code>docs/behavior.md</code> — M\n- <code>source.txt</code> — M\n- <code>tests/regression.cjs</code> — ?',
    );
    const markdown = readFileSync(join(run, 'report.md'), 'utf8');
    assert.equal(
      section(markdown),
      '- <code>docs/behavior.md</code> — M\n- <code>source.txt</code> — M\n- <code>tests/regression.cjs</code> — ?',
    );
    assert.ok(markdown.includes('## Operations\n\nNo managed operations recorded.'));
    assert.ok(markdown.includes('## Managed services\n\nNo managed services recorded.'));
  }

  /** Verifies that built clireport includes coordination evidence and explicit historical absence. */
  builtCLIReportIncludesCoordinationEvidenceAndExplicitHistoricalAbsence(t: TestContext) {
    const f = workflowFixture(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout),
      md = readFileSync(join(f.state, 'runs', data.id, 'report.md'), 'utf8');
    for (const heading of [
      'Execution accounting',
      'Usage',
      'Supplied context',
      'Host checks',
      'Boundary requests',
      'Caller interventions',
      'Findings and uncertainty',
    ])
      assert.ok(md.includes('## ' + heading), heading);
    assert.ok(data.commands.some((c: any) => c.stage === 'verification'));
    assert.match(md, /verification/);
    assert.match(md, /Actual turns: 3/);
    assert.match(md, /not complete effective Codex context/);
    assert.match(markdownReport(record), /Usage completeness: unavailable/);
  }
}

const suite = new ReportCliTests();

test('built CLI run renders observed changes from the production workflow', (t: any) =>
  suite.builtCLIRunRendersObservedChangesFromTheProductionWorkflow(t));

test('built CLI report includes coordination evidence and explicit historical absence', (t: any) =>
  suite.builtCLIReportIncludesCoordinationEvidenceAndExplicitHistoricalAbsence(t));

registerSuite({ component: 'report', level: 'acceptance', tags: ['deterministic'] });
