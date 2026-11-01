import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { cli } from '../../testing/support/workflow-fixture.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises exact public commands through the real background-host construction path. */
class GeneralCliScenarios {
  /** Starts an idle workday, runs a dynamically expanded task, and preserves explicit pause intent. */
  async lifecycle(t: TestContext): Promise<void> {
    const general = new GeneralFixture(t);
    const command = this.command(general);
    const started = JSON.parse(command('workday', 'start'));
    assert.equal(started.workday.status, 'running');
    general.captureHost();
    this.sharedHost(general, started.workday.id);
    await this.untilIdle(command);
    const task = command('task', 'run', 'Research the supplier chain');
    const result = JSON.parse(task.trim().split('\n').at(-1)!);
    assert.equal(result.run.status, 'completed');
    assert.deepEqual(
      result.assignments.map((a: any) => a.owner),
      ['a', 'b', 'c'],
    );
    assert.ok(result.assignments.every((a: any) => a.status === 'completed'));
    command('workday', 'pause');
    command('task', 'run', 'Research the supplier chain again');
    assert.equal(JSON.parse(command('workday', 'status')).workday.status, 'paused');
    command('workday', 'stop');
    assert.equal(JSON.parse(command('workday', 'status')).workday.status, 'stopped');
  }

  /** A second CLI with a different state root must attach to the same canonical repository host. */
  private sharedHost(general: GeneralFixture, id: string): void {
    const f = general.fixture;
    const result = spawnSync(process.execPath, [cli, 'workday', 'start'], {
      cwd: f.repo,
      env: { ...f.env, ARCNEXUS_STATE_DIR: f.state + '-other' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).workday.id, id);
  }

  /** Executes the built CLI and includes terminal failure evidence in assertions. */
  private command(general: GeneralFixture) {
    const f = general.fixture;
    const command = (...args: string[]) => {
      const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: f.repo,
        env: f.env,
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      });
      assert.equal(result.status, 0, result.stderr + result.stdout.trim().split('\n').at(-1));
      return result.stdout;
    };
    return command;
  }

  /** Waits only for observable host lifecycle progress, with an explicit test watchdog. */
  private async untilIdle(command: (...args: string[]) => string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const status = JSON.parse(command('workday', 'status'));
      if (status.workday.status === 'idle') return;
      assert.notEqual(status.workday.status, 'needs_attention', JSON.stringify(status));
      await delay(100);
    }
    assert.fail('Workday did not reach idle');
  }
}

const scenarios = new GeneralCliScenarios();

test('option-free CLI hosts workdays and routes a prompt through three dynamic owners', (t) =>
  scenarios.lifecycle(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
