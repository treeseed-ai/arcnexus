import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class InitializationCleanupTests {
  refusesUnresolvedInitialization(t: TestContext, resource: boolean): void {
    const f = workflowFixture(t);
    const result = f.run('--kind', 'research');
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    if (resource) {
      const directory = join(f.state, 'runs', record.initialization.runId, 'services');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'unresolved.json'),
        JSON.stringify({ runId: record.initialization.runId, status: 'starting' }),
      );
    } else {
      record.status = 'initializing';
      delete record.finishedAt;
      writeFileSync(join(f.state, 'runs', record.id, 'report.json'), JSON.stringify(record));
    }
    const cleaned = spawnSync(process.execPath, [cli, 'cleanup', record.id], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(cleaned.status, 1, cleaned.stderr);
    assert.ok(existsSync(record.workspace));
  }
}
const suite = new InitializationCleanupTests();
test('cleanup refuses an incomplete initialization record', (t) =>
  suite.refusesUnresolvedInitialization(t, false));
test('cleanup includes initializer-owned service resources', (t) =>
  suite.refusesUnresolvedInitialization(t, true));
