import { groupMembers } from '../../dist/operations/service-state.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { waitFor } from '../development-tooling/test-process.js';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class ParentLossTests {
  async builtSDKLauncherStopsCodexAfterHardHostLoss_1(t: TestContext) {
    const f = workflowFixture(t, 'specification-timeout'),
      child = spawn(
        process.execPath,
        [cli, 'run', 'sample', 'Bounded change', '--project', f.repo, '--codex-path', f.executable],
        { env: f.env, stdio: 'ignore' },
      );
    let pid: number | undefined;
    t.after(() => {
      child.kill('SIGKILL');
      if (pid)
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
    });
    await waitFor(() => {
      pid = this.codexPid(f);
      return !!pid;
    }, 'Controlled Codex must start');
    assert.ok(pid, 'controlled Codex reached execution');
    const exited = new Promise((r: any) => child.once('close', r));
    child.kill('SIGKILL');
    await exited;
    await waitFor(
      () => groupMembers(pid!).length === 0,
      'No steward process survives host loss',
      5000,
    );
    assert.deepEqual(groupMembers(pid), [], 'no steward process survives host loss');
  }
  private codexPid(f: any): number | undefined {
    if (!existsSync(f.calls) || !existsSync(join(f.state, 'runs'))) return undefined;
    for (const id of readdirSync(join(f.state, 'runs'))) {
      const path = join(f.state, 'runs', id, 'codex.pid');
      if (existsSync(path)) return Number(readFileSync(path, 'utf8'));
    }
    return undefined;
  }
}
const suite = new ParentLossTests();

test('built SDK launcher stops Codex after hard host loss', (t: any) =>
  suite.builtSDKLauncherStopsCodexAfterHardHostLoss_1(t));
