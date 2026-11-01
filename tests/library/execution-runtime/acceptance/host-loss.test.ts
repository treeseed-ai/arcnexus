import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { cli, type WorkflowFixture } from '../../testing/support/workflow-fixture.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Kills the actual background host while its managed harness is active and inspects recovery. */
class HostLossScenario {
  /** Parent loss kills managed execution and a replacement host retains uncertainty without replay. */
  async run(t: TestContext): Promise<void> {
    const directory = mkdtempSync(join(tmpdir(), 'arcnexus-host-loss-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const gate = join(directory, 'release');
    const general = new GeneralFixture(t, gate);
    const client = spawn(process.execPath, [cli, 'task', 'run', 'Research supplier evidence'], {
      cwd: general.fixture.repo,
      env: general.fixture.env,
      stdio: 'ignore',
    });
    const finished = new Promise((resolve) => client.once('exit', resolve));
    try {
      await this.until(() => existsSync(gate + '.entered'));
      general.captureHost();
      const managed = Number(readFileSync(gate + '.entered', 'utf8'));
      process.kill(general.hostPid!, 'SIGKILL');
      await this.until(() => this.gone(managed));
      await finished;
      this.recovery(general);
    } finally {
      client.kill('SIGINT');
      await finished;
      try {
        general.captureHost();
        process.kill(general.hostPid!, 'SIGTERM');
      } catch {
        /* Already stopped. */
      }
    }
  }

  /** Reopens through the normal status command and verifies retained model evidence is not replayed. */
  private recovery(general: GeneralFixture): void {
    const f = general.fixture;
    const calls = readFileSync(f.calls, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'workday', 'status'], {
      cwd: f.repo,
      env: f.env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    general.captureHost();
    const status = JSON.parse(result.stdout);
    assert.equal(status.tasks[0].status, 'interrupted');
    assert.equal(status.active, null);
    assert.equal(readFileSync(f.calls, 'utf8'), calls);
    this.evidence(f);
  }

  /** Requires the interrupted activation's actual report and unsafe checkpoint to remain available. */
  private evidence(f: WorkflowFixture): void {
    const records = readdirSync(join(f.state, 'runs')).map((id) =>
      JSON.parse(readFileSync(join(f.state, 'runs', id, 'report.json'), 'utf8')),
    );
    const worker = records.find((record) => record.assignmentId && record.stage === 'planning');
    assert.ok(worker);
    assert.equal(worker.safeCheckpoint, false);
    assert.ok(worker.commands.length > 0);
  }

  /** Observes a known test-owned process without sending it another signal. */
  private gone(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
  }

  /** Applies only a test watchdog while waiting for observable lifecycle changes. */
  private async until(observed: () => boolean): Promise<void> {
    for (let observation = 0; observation < 600; observation++) {
      if (observed()) return;
      await delay(25);
    }
    assert.fail('Host-loss observation did not settle');
  }
}

const scenario = new HostLossScenario();

test('host loss stops managed execution and retains an interrupted task without replay', (t) =>
  scenario.run(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
