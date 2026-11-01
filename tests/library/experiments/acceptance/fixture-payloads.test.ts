import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { materializeFixture } from '../../testing/support/fixture-payloads.js';
class FixturePayloadTests {
  identityRunsCompiledTests(t: TestContext): void {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-compiled-fixture-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    materializeFixture('identity', root);
    assert.equal(existsSync(join(root, 'src/identity.mts')), false);
    assert.equal(existsSync(join(root, 'src/identity.mjs')), true);
    const result = spawnSync(process.execPath, ['--test', 'tests/identity.test.mjs'], {
      cwd: root,
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /identity normalization trims and lowercases/);
    assert.match(result.stdout, /# pass 1/);
  }
}
const suite = new FixturePayloadTests();
test('materialized identity fixture runs its compiled class-based acceptance test', (t) =>
  suite.identityRunsCompiledTests(t));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
