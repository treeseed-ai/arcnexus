import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';
class TaskTests {
  readyResearch(t: TestContext, stale = false): void {
    const f = workflowFixture(t);
    f.configure({ initializerMode: 'proposal-research' });
    const input = join(f.root, 'request.txt');
    writeFileSync(input, 'Research sample behavior');
    const planned = this.plan(f, input);
    assert.equal(planned.status, 0, planned.stderr);
    const proposal = JSON.parse(planned.stdout);
    assert.equal(proposal.status, 'ready');
    if (stale) writeFileSync(input, 'Changed request');
    const result = this.command(f, 'run', proposal.id);
    assert.equal(result.status, stale ? 2 : 0, result.stderr);
    assert.equal(
      readFileSync(f.calls + '../.initialization', 'utf8')
        .trim()
        .split('\n').length,
      1,
    );
    if (stale) assert.equal(existsSync(f.calls), false);
    else {
      const report = JSON.parse(result.stdout);
      assert.equal(report.outcome, 'research_completed');
      assert.equal(report.acceptedProposal, proposal.id);
    }
  }
  private plan(f: ReturnType<typeof workflowFixture>, input: string) {
    return this.command(
      f,
      'plan',
      '--input',
      input,
      '--project',
      f.repo,
      '--codex-path',
      f.executable,
    );
  }
  private command(f: ReturnType<typeof workflowFixture>, ...args: string[]) {
    return spawnSync(process.execPath, [cli, 'task', ...args], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
  }
  missingOwner(t: TestContext): void {
    const f = workflowFixture(t);
    f.configure({ initializerMode: 'proposal-missing' });
    const input = join(f.root, 'request.txt');
    writeFileSync(input, 'Introduce a missing external deployment responsibility');
    const result = spawnSync(
      process.execPath,
      [cli, 'task', 'plan', '--input', input, '--project', f.repo, '--codex-path', f.executable],
      { encoding: 'utf8', env: f.env, timeout: 30 * 60 * 1000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const proposal = JSON.parse(result.stdout);
    assert.equal(proposal.status, 'architecture_change_required');
    assert.equal(existsSync(f.calls), false);
    assert.equal(f.git('status', '--porcelain'), '');
    const inspect = spawnSync(process.execPath, [cli, 'task', 'inspect', proposal.id, '--json'], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).digest, proposal.digest);
    const run = spawnSync(process.execPath, [cli, 'task', 'run', proposal.id], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(run.status, 2, run.stderr);
  }
}
const suite = new TaskTests();
test('missing-owner task retains inspectable proposal without worker inference or source edits', (t) =>
  suite.missingOwner(t));

test('ready task executes without duplicate initialization', (t) => suite.readyResearch(t));
test('changed request invalidates a ready task before worker activation', (t) =>
  suite.readyResearch(t, true));

registerSuite({ component: 'task-intake', level: 'acceptance', tags: ['deterministic'] });
