import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class ExecutionLimitTests {
  absent(t: TestContext, schemaVersion: number): void {
    const fixture = workflowFixture(t);
    const path = join(fixture.repo, 'architecture/execution-profiles/luna.yaml');
    const profile = JSON.parse(readFileSync(path, 'utf8'));
    profile.schemaVersion = schemaVersion;
    for (const key of [
      'timeoutSeconds',
      'commandTimeoutSeconds',
      'maxTurns',
      'maxCorrectiveTurns',
      'maxOperationCalls',
    ])
      delete profile[key];
    writeFileSync(path, JSON.stringify(profile));
    fixture.commit();
    const result = spawnSync(
      process.execPath,
      [cli, 'inspect', 'sample', 'Improve behavior', '--project', fixture.repo, '--json'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const resolved = JSON.parse(result.stdout);
    for (const key of ['timeoutSeconds', 'commandTimeoutSeconds', 'maxTurns', 'maxOperationCalls'])
      assert.equal(resolved.executionProfile[key], undefined);
  }
  explicitAttempts(t: TestContext): void {
    const fixture = workflowFixture(t);
    const result = fixture.run('--max-attempts', '3');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).implementationAttempts, 1);
  }
}
const suite = new ExecutionLimitTests();
for (const version of [1, 2, 3])
  test(`schema ${version} missing execution limits remain unconfigured`, (t) =>
    suite.absent(t, version));
test('caller may explicitly select more than the former two-attempt ceiling', (t) =>
  suite.explicitAttempts(t));
