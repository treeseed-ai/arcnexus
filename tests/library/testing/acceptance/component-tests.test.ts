import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

/** Exercises component test command behavior through observable scenarios. */
class ComponentTestCommandTests {
  /** Verifies that component test CLI inspects real report unit tests without inference. */
  inspectsReportUnitTests(): void {
    const result = this.run('inspect', 'report', '--level', 'unit', '--json');
    assert.equal(result.status, 0, result.stderr);
    const selection = JSON.parse(result.stdout);
    assert.ok(selection.suites.length > 0);
    assert.ok(
      selection.suites.every(
        (suite: any) => suite.component === 'report' && suite.level === 'unit',
      ),
    );
    assert.equal(selection.inference, false);
  }

  /** Verifies that component test CLI rejects an empty required selection. */
  rejectsEmptySelection(): void {
    const result = this.run('inspect', 'report', '--tag', 'does-not-exist', '--json');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /No tests match/);
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  private run(...args: string[]) {
    return spawnSync(
      process.execPath,
      [resolve('dist/cli.js'), 'test', ...args, '--project', process.cwd()],
      { encoding: 'utf8' },
    );
  }
}

const suite = new ComponentTestCommandTests();

test('component test CLI inspects real report unit tests without inference', () =>
  suite.inspectsReportUnitTests());

test('component test CLI rejects an empty required selection', () => suite.rejectsEmptySelection());

registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
