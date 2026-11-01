import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { cli } from '../../../library/testing/support/workflow-fixture.js';

/** Verifies retired execution commands cannot dispatch a second engineering engine. */
class ExecutionMigrationScenarios {
  /** Rejects old execution before consulting paths or acquiring project execution. */
  retired(args: string[]): void {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /retired.*task run|retired.*workday start/i);
  }

  /** Normal help exposes both simple modes without old proposal or budget requirements. */
  help(): void {
    const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /workday start\|pause\|resume\|stop\|status/);
    assert.match(result.stdout, /task run "<prompt>"/);
    assert.doesNotMatch(
      result.stdout,
      /max-attempts|timeout-seconds|task plan|legacy-run|workday run/,
    );
  }
}

const scenarios = new ExecutionMigrationScenarios();

for (const args of [
  ['run', 'owner', 'objective'],
  ['workday', 'run', 'missing-manifest.yaml'],
  ['task', 'plan'],
  ['task', 'legacy-run', 'historical-proposal'],
])
  test(`retired ${args.slice(0, 2).join(' ')} returns a migration diagnostic`, () =>
    scenarios.retired(args));

test('normal CLI help presents only the simple execution modes', () => scenarios.help());

registerSuite({ component: 'cli', level: 'acceptance', tags: ['deterministic'] });
