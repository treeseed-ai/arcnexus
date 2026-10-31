import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { handoffFixture } from '../development-tooling/handoff-fixture.js';
import { cli } from '../development-tooling/workflow-fixture.js';
class WorkdayInterruptionTests {
  async scenario_1(t: TestContext, signal: any) {
    const f = handoffFixture(t, 'hang'),
      marker = join(f.root, 'agent-pid'),
      child = spawn(
        process.execPath,
        [cli, 'workday', 'run', f.manifest, '--project', f.repo, '--codex-path', f.executable],
        { env: f.env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    let output = '';
    child.stdout.on('data', (x: any) => (output += x));
    child.stderr.resume();
    const finished = new Promise((resolve: any) => child.once('exit', resolve));
    t.after(() => child.kill('SIGKILL'));
    const deadline = Date.now() + 30000;
    while (!existsSync(marker)) {
      assert.ok(Date.now() < deadline, 'recipient inference must start');
      await delay(50);
    }
    const pid = Number(readFileSync(marker));
    child.kill(signal);
    const code = await finished;
    const end = Date.now() + 5000;
    while (existsSync('/proc/' + pid)) {
      assert.ok(Date.now() < end, 'managed inference must stop');
      await delay(50);
    }
    if (signal === 'SIGINT') {
      assert.equal(code, 130);
      const w = JSON.parse(output);
      assert.equal(w.status, 'cancelled');
      assert.equal(w.parking.status, 'restored');
    } else {
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
}
const suite = new WorkdayInterruptionTests();

for (const signal of ['SIGINT', 'SIGKILL'])
  test('workday ' + signal + ' stops managed inference and preserves parked evidence', (t: any) =>
    suite.scenario_1(t, signal),
  );
