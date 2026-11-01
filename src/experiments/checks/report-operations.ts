import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
class OperationReportAcceptance {
  private readonly base = {
    id: 'qualification',
    source: '/source',
    workspace: '/candidate',
    branch: 'candidate',
    base: 'abc',
    commonDir: '/git',
    status: 'completed',
    startedAt: '2026-10-31T00:00:00Z',
    environment: {},
    commands: [],
  };
  private readonly captured = {
    ...this.base,
    operations: [
      { id: 'alpha', exitCode: 0, durationMs: 17, log: '/evidence/alpha.log' },
      { id: 'beta', exitCode: 1, durationMs: 23, log: '/evidence/beta.log' },
    ],
    services: [{ id: 'local', status: 'stopped', endpointClosed: true }],
  };
  async run(): Promise<void> {
    const { markdownReport } = await import(
      pathToFileURL(
        resolve(existsSync('dist/report/report.js') ? 'dist/report/report.js' : 'dist/report.js'),
      ).href
    );
    const before = JSON.stringify(this.captured),
      report = markdownReport(this.captured);
    assert.match(report, /## Operations\n/, 'OPERATIONS_SECTION_REQUIRED');
    assert.match(report, /## Managed services\n/, 'SERVICES_SECTION_REQUIRED');
    for (const value of [
      'alpha',
      'beta',
      'passed',
      'failed',
      '17',
      '23',
      '/evidence/alpha.log',
      '/evidence/beta.log',
      'local',
      'stopped',
      'true',
    ])
      assert.ok(report.includes(value), 'missing captured value: ' + value);
    assert.equal(JSON.stringify(this.captured), before, 'report must not mutate captured evidence');
    this.historical(markdownReport);
    console.log('INDEPENDENT_REPORT_OPERATIONS_PASSED');
  }
  private historical(markdownReport: (record: any) => string): void {
    const historical = markdownReport(this.base);
    assert.match(historical, /No managed operations recorded\./);
    assert.match(historical, /No managed services recorded\./);
    assert.doesNotMatch(historical, /undefined|null/);
  }
}
await new OperationReportAcceptance().run();
