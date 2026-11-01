import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { handoffFixture } from '../../testing/support/handoff-fixture.js';
import { TestProcess, waitFor } from '../../testing/support/test-process.js';
import { cli } from '../../testing/support/workflow-fixture.js';

/** Exercises workday interruption behavior through observable scenarios. */
class WorkdayInterruptionTests {
  /** Verifies the scenario retains evidence after interruption. */
  async retainsEvidenceAfterInterruption(t: TestContext, signal: any) {
    const f = handoffFixture(t, 'hang'),
      marker = join(f.root, 'agent-pid'),
      child = new TestProcess(
        t,
        [cli, 'workday', 'run', f.manifest, '--project', f.repo, '--codex-path', f.executable],
        f.env,
      );
    await child.waitForReady(() => existsSync(marker), 'Recipient inference must start');
    const pid = Number(readFileSync(marker));
    child.kill(signal);
    const code = await child.closed;
    await waitFor(() => !existsSync('/proc/' + pid), 'Managed inference must stop', 5000);
    if (signal === 'SIGINT') {
      assert.equal(code, 130);
      const w = JSON.parse(child.stdout);
      assert.equal(w.status, 'cancelled');
      assert.equal(w.parking.status, 'restored');
    } else {
      await this.assertInterrupted(f);
    }
  }

  /** Reads the built workday viewer and requires interruption to remain visible in durable state. */
  private async assertInterrupted(f: any): Promise<void> {
    const { readdirSync } = await import('node:fs'),
      id = readdirSync(join(f.state, 'workdays'))[0]!,
      r = spawnSync(process.execPath, [cli, 'workday', 'status', id, '--json'], {
        env: f.env,
        encoding: 'utf8',
      });
    assert.equal(r.status, 0, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.equal(w.interrupted, true);
    assert.equal(w.workday.status, 'running');
    assert.ok(existsSync(join(f.state, 'workdays', id, 'parking.json')));
  }
}

const suite = new WorkdayInterruptionTests();

for (const signal of ['SIGINT', 'SIGKILL'])
  test('workday ' + signal + ' stops managed inference and preserves parked evidence', (t: any) =>
    suite.retainsEvidenceAfterInterruption(t, signal),
  );

registerSuite({ component: 'workday', level: 'acceptance', tags: ['deterministic'] });
