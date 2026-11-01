import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { operationFixture } from '../development-tooling/operations-fixture.js';
import { cli } from '../development-tooling/workflow-fixture.js';
class ProgressProjectionTests {
  reportsVerifiedProgress(t: TestContext): void {
    const f = operationFixture(t);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    const status = spawnSync(process.execPath, [cli, 'status', record.id, '--json'], {
      encoding: 'utf8',
      env: f.env,
      timeout: 10000,
    });
    assert.equal(status.status, 0, status.stderr);
    const view = JSON.parse(status.stdout);
    assert.ok(view.progress.lastVerified);
    assert.equal(view.progress.checklist.total, 1);
    assert.equal(view.progress.checklist.completed, 1);
    assert.equal(view.progress.checklist.basis, 'agent claims; host checks reported separately');
    assert.equal(view.progress.cancellation, 'not requested');
    const markdown = readFileSync(join(f.state, 'runs', record.id, 'report.md'), 'utf8');
    assert.match(markdown, /## Initialization/);
    assert.match(markdown, /## Execution progress/);
    assert.match(markdown, /Last verified progress/);
  }
}
const suite = new ProgressProjectionTests();
test('status and readable report separate checklist claims from verified progress', (t) =>
  suite.reportsVerifiedProgress(t));
