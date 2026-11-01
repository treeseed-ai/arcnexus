import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { groupMembers } from '../../dist/operations/service-state.js';
import { TestProcess, waitFor, killProcessGroup } from '../development-tooling/test-process.js';
class WorkspaceTests {
  builtPrepareCreatesAPinnedWorkspaceRunsSetupThereAndCleanupRetainsBranchReport_1(t: TestContext) {
    const f = fixture(t, [
      {
        command: 'node',
        args: [
          '-e',
          "require('fs').mkdirSync('generated');require('fs').writeFileSync('generated/cwd',process.cwd())",
        ],
      },
    ]);
    const base = f.git('rev-parse', 'HEAD');
    const result = f.prepare('--issue', '7');
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.base, base);
    assert.match(record.branch, /^codex\/7-/);
    assert.equal(readFileSync(join(record.workspace, 'generated/cwd'), 'utf8'), record.workspace);
    assert.equal(f.git('status', '--porcelain'), '');
    assert.equal(f.git('branch', '--show-current'), 'main');
    assert.equal(f.run('cleanup', record.id).status, 0);
    assert.equal(existsSync(record.workspace), false);
    assert.equal(f.git('rev-parse', record.branch), base);
    assert.equal(existsSync(join(f.state, 'runs', record.id, 'report.json')), true);
    assert.equal(f.run('cleanup', record.id).status, 0);
  }
  dirtySourceIsRejectedWithoutPreparation_2(t: TestContext) {
    const f = fixture(t);
    writeFileSync(join(f.repo, 'source.txt'), 'dirty');
    const r = f.prepare();
    assert.equal(r.status, 2);
    assert.match(r.stderr, /clean/i);
  }
  setupFailureRetainsEvidenceAndWorkspace_3(t: TestContext) {
    const f = fixture(t, [
      { command: 'node', args: ['-e', 'console.error("setup broke");process.exit(4)'] },
    ]);
    const r = f.prepare();
    assert.equal(r.status, 1);
    const record = JSON.parse(r.stdout);
    assert.equal(record.status, 'failed');
    assert.ok(existsSync(record.workspace));
    assert.match(
      readFileSync(join(f.state, 'runs', record.id, 'command-0.log'), 'utf8'),
      /setup broke/,
    );
  }
  setupSourceMutationIsRejectedAndCleanupRefusesToLoseIt_4(t: TestContext) {
    const f = fixture(t, [
      { command: 'node', args: ['-e', "require('fs').writeFileSync('source.txt','changed')"] },
    ]);
    const r = f.prepare();
    assert.equal(r.status, 1);
    const record = JSON.parse(r.stdout);
    assert.equal(f.run('cleanup', record.id).status, 1);
    assert.equal(readFileSync(join(record.workspace, 'source.txt'), 'utf8'), 'changed');
  }
  cleanupRefusesUnknownIgnoredFilesAndUntrackedFiles_5(t: TestContext) {
    const f = fixture(t);
    const r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    for (const name of ['.env', 'valuable.txt']) {
      writeFileSync(join(record.workspace, name), 'keep');
      assert.equal(f.run('cleanup', record.id).status, 1);
      assert.equal(readFileSync(join(record.workspace, name), 'utf8'), 'keep');
      rmSync(join(record.workspace, name));
    }
    assert.equal(f.run('cleanup', record.id).status, 0);
  }
  overallTimeoutRetainsAFailedRecord_6(t: TestContext) {
    const f = fixture(t, [{ command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] }]);
    const r = f.prepare('--timeout-seconds', '0.2');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /timed out/i);
    assert.equal(JSON.parse(r.stdout).status, 'failed');
  }
  async SIGINTCancelsCommandAndReleasesLock_7(t: TestContext) {
    const f = fixture(t, [
      { command: 'node', args: ['-e', 'console.log("READY");setInterval(()=>{},1000)'] },
    ]);
    const child = spawn(process.execPath, [cli, 'prepare', '--project', f.repo], { env: f.env });
    let output = '';
    child.stdout.on('data', (b: any) => (output += b));
    const exited = new Promise((r: any) => child.once('close', r));
    t.after(() => child.kill('SIGKILL'));
    let ready = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const run = join(f.state, 'runs', readdirSync(join(f.state, 'runs'))[0]!);
        ready = readdirSync(run)
          .filter((n: any) => n.startsWith('command-'))
          .some((n: any) => readFileSync(join(run, n), 'utf8').includes('READY'));
      } catch {}
      if (ready) break;
      await new Promise((r: any) => setTimeout(r, 20));
    }
    assert.ok(ready, 'setup command must be running before cancellation');
    child.kill('SIGINT');
    const code = await exited;
    assert.equal(code, 130);
    assert.equal(JSON.parse(output).status, 'cancelled');
    assert.equal(existsSync(join(f.state, 'active.lock')), false);
  }
  invalidConfigurationAndMissingPrerequisiteFailAtTheirRespectiveStages_8(t: TestContext) {
    const f = fixture(t);
    writeFileSync(
      join(f.repo, 'architecture/environment.yaml'),
      JSON.stringify({
        schemaVersion: 1,
        prerequisites: [],
        setup: [],
        generatedDirectories: ['../escape'],
      }),
    );
    f.git('add', '.');
    f.git('commit', '-m', 'invalid');
    assert.equal(f.prepare().status, 2);
    writeFileSync(
      join(f.repo, 'architecture/environment.yaml'),
      JSON.stringify({
        schemaVersion: 1,
        prerequisites: [{ command: 'arcnexus-nonexistent-tool', args: [] }],
        setup: [],
        generatedDirectories: [],
      }),
    );
    f.git('add', '.');
    f.git('commit', '-m', 'missing tool');
    const r = f.prepare();
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).commands.length, 1);
  }
  lockPreventsOverlappingOperationsAndOwnershipTamperingRefusesCleanup_9(t: TestContext) {
    const f = fixture(t);
    const r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    writeFileSync(join(f.state, 'active.lock'), 'interrupted');
    assert.equal(f.prepare().status, 1);
    rmSync(join(f.state, 'active.lock'));
    const path = join(f.state, 'runs', record.id, 'report.json');
    writeFileSync(path, JSON.stringify({ ...record, workspace: f.repo }));
    assert.equal(f.run('cleanup', record.id).status, 1);
    assert.ok(existsSync(f.repo));
  }
  explicitBaseRemainsPinnedWhileSourceHEADAdvances_10(t: TestContext) {
    const f = fixture(t),
      base = f.git('rev-parse', 'HEAD');
    writeFileSync(join(f.repo, 'source.txt'), 'new');
    f.git('add', '.');
    f.git('commit', '-m', 'advance');
    const r = f.prepare('--base', base);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      readFileSync(join(JSON.parse(r.stdout).workspace, 'source.txt'), 'utf8'),
      'original\n',
    );
    assert.equal(readFileSync(join(f.repo, 'source.txt'), 'utf8'), 'new');
  }
  async worktreeCreationDoesNotOverwriteACollidingBranchOrDirectory_11(t: TestContext) {
    const { createWorkspace, prepareWorkspace } = await import('../../dist/workspace/workspace.js');
    const { stateRoot } = await import('../../dist/workspace/state.js');
    const f = fixture(t);
    const previous = process.env.ARCNEXUS_STATE_DIR;
    process.env.ARCNEXUS_STATE_DIR = f.state;
    t.after(() => {
      if (previous === undefined) delete process.env.ARCNEXUS_STATE_DIR;
      else process.env.ARCNEXUS_STATE_DIR = previous;
    });
    const root = stateRoot(),
      record = createWorkspace(root, { project: f.repo });
    f.git('branch', record.branch);
    await assert.rejects(prepareWorkspace(root, record, new AbortController().signal));
    f.git('branch', '-D', record.branch);
    mkdirSync(record.workspace);
    writeFileSync(join(record.workspace, 'precious'), 'keep');
    await assert.rejects(prepareWorkspace(root, record, new AbortController().signal));
    assert.equal(readFileSync(join(record.workspace, 'precious'), 'utf8'), 'keep');
  }
  scenario_12(t: TestContext, failed: any) {
    const f = fixture(t, failed ? [{ command: 'node', args: ['-e', 'process.exit(4)'] }] : []);
    const prepared = f.prepare();
    assert.equal(prepared.status, failed ? 1 : 0, prepared.stderr);
    const record = JSON.parse(prepared.stdout),
      original = evidence(f, record);
    const first = f.run('cleanup', record.id);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), { ...record, cleanupStatus: 'removed' });
    original.assertReports();
    const receiptPath = join(original.dir, 'cleanup.json'),
      receipt = readFileSync(receiptPath);
    const metadata = JSON.parse(String(receipt));
    assert.equal(metadata.cleanupStatus, 'removed');
    assert.ok(Number.isFinite(Date.parse(metadata.removedAt)));
    assert.equal(existsSync(record.workspace), false);
    const second = f.run('cleanup', record.id);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(second.stdout), { ...record, cleanupStatus: 'removed' });
    original.assertReports();
    assert.deepEqual(readFileSync(receiptPath), receipt);
  }
  scenario_13(t: TestContext, legacy: any) {
    const f = fixture(t),
      prepared = f.prepare();
    assert.equal(prepared.status, 0, prepared.stderr);
    const record = JSON.parse(prepared.stdout);
    this.removeInitialCandidate(f, record, legacy);
    const original = evidence(f, record),
      receiptPath = join(original.dir, 'cleanup.json');
    const receipt = legacy ? undefined : readFileSync(receiptPath);
    const checkEvidence = () => {
      original.assertReports();
      if (legacy) assert.equal(existsSync(receiptPath), false);
      else assert.deepEqual(readFileSync(receiptPath), receipt);
    };
    for (const kind of ['file', 'directory', 'symlink', 'dangling symlink']) {
      this.assertReplacementPreserved(f, record, kind);
      checkEvidence();
      rmSync(record.workspace, { recursive: true });
    }
    for (let i = 0; i < 2; i++) {
      const result = f.run('cleanup', record.id);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { ...record, cleanupStatus: 'removed' });
      checkEvidence();
    }
  }
  private removeInitialCandidate(f: any, record: any, legacy: boolean): void {
    if (legacy) {
      f.git('worktree', 'remove', record.workspace);
      record.status = 'removed';
      writeFileSync(join(f.state, 'runs', record.id, 'report.json'), JSON.stringify(record));
    } else {
      const result = f.run('cleanup', record.id);
      assert.equal(result.status, 0, result.stderr);
    }
  }
  private assertReplacementPreserved(f: any, record: any, kind: string): void {
    if (kind === 'file') writeFileSync(record.workspace, 'keep');
    else if (kind === 'directory') {
      mkdirSync(record.workspace);
      writeFileSync(join(record.workspace, 'keep'), 'keep');
    } else symlinkSync(kind === 'symlink' ? f.repo : join(f.root, 'missing'), record.workspace);
    const result = f.run('cleanup', record.id);
    assert.equal(result.status, 1, `${kind}: ${result.stderr}`);
    if (kind.includes('symlink')) {
      assert.ok(lstatSync(record.workspace).isSymbolicLink());
      assert.equal(
        readlinkSync(record.workspace),
        kind === 'symlink' ? f.repo : join(f.root, 'missing'),
      );
    } else
      assert.equal(
        readFileSync(kind === 'file' ? record.workspace : join(record.workspace, 'keep'), 'utf8'),
        'keep',
      );
  }
  async preservesEvidenceAfterParentLoss(t: TestContext) {
    const f = fixture(t, [
      {
        command: process.execPath,
        args: ['-e', "console.log('COMMAND_PID='+process.pid);setInterval(()=>{},1000)"],
      },
    ]);
    const child = new TestProcess(t, [cli, 'prepare', '--project', f.repo], f.env);
    let captured: { pid: number; record: string; log: string } | undefined;
    t.after(() => killProcessGroup(captured?.pid));
    await waitFor(() => {
      captured = this.runningSetup(f);
      return !!captured;
    }, 'Command must reach observable running state');
    assert.ok(captured);
    child.kill('SIGKILL');
    await child.closed;
    await waitFor(
      () => groupMembers(captured!.pid).length === 0,
      'Parent-loss supervisor must stop command group',
      5000,
    );
    assert.deepEqual(groupMembers(captured.pid), []);
    assert.match(readFileSync(captured.log, 'utf8'), /COMMAND_PID=/);
    assert.equal(JSON.parse(readFileSync(captured.record, 'utf8')).finishedAt, undefined);
  }
  private runningSetup(f: any): { pid: number; record: string; log: string } | undefined {
    for (const id of readdirSync(join(f.state, 'runs'))) {
      const directory = join(f.state, 'runs', id),
        log = join(directory, 'command-0.log');
      if (!existsSync(log)) continue;
      const match = readFileSync(log, 'utf8').match(/COMMAND_PID=(\d+)/);
      if (match) return { pid: Number(match[1]), log, record: join(directory, 'report.json') };
    }
    return undefined;
  }
  cleanupReconcilesPrimaryRemovalOnlyWithDurableMatchingIntent_15(t: TestContext) {
    const f = fixture(t),
      r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    const dir = join(f.state, 'runs', record.id);
    const intent = cleanupIntent(record);
    writeFileSync(join(dir, 'cleanup-intent.json'), JSON.stringify(intent));
    writeFileSync(join(dir, 'members-cleanup.json'), JSON.stringify({ removed: [] }));
    const before = readFileSync(join(dir, 'report.json'));
    f.git('worktree', 'remove', record.workspace);
    const result = f.run('cleanup', record.id);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(join(dir, 'report.json')), before);
    assert.equal(
      JSON.parse(String(readFileSync(join(dir, 'cleanup-intent.json')))).status,
      'removed',
    );
    assert.equal(f.run('cleanup', record.id).status, 0);
  }
  cleanupRefusesUnexplainedDisappearanceAndReplacementAfterIntent_16(t: TestContext) {
    const f = fixture(t),
      record = JSON.parse(f.prepare().stdout),
      dir = join(f.state, 'runs', record.id);
    const intent = cleanupIntent(record);
    f.git('worktree', 'remove', record.workspace);
    assert.equal(f.run('cleanup', record.id).status, 1);
    writeFileSync(join(dir, 'cleanup-intent.json'), JSON.stringify(intent));
    mkdirSync(record.workspace);
    writeFileSync(join(record.workspace, 'precious'), 'keep');
    assert.equal(f.run('cleanup', record.id).status, 1);
    assert.equal(readFileSync(join(record.workspace, 'precious'), 'utf8'), 'keep');
  }
}
const suite = new WorkspaceTests();

const cli = resolve('dist/cli.js');
function cleanupIntent(record: any) {
  const stat = lstatSync(record.workspace);
  return {
    schemaVersion: 1,
    id: record.id,
    source: record.source,
    commonDir: record.commonDir,
    base: record.base,
    branch: record.branch,
    workspace: record.workspace,
    device: stat.dev,
    inode: stat.ino,
    members: record.members,
    status: 'removing',
  };
}
function fixture(t: any, setup: any = []): any {
  const root = mkdtempSync(join(tmpdir(), 'arcnexus-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'),
    state = join(root, 'state');
  mkdirSync(join(repo, 'architecture'), { recursive: true });
  const git = (...args: any) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  writeFileSync(join(repo, '.gitignore'), 'generated/\n.env\n');
  writeFileSync(join(repo, 'source.txt'), 'original\n');
  writeEnvironment(repo, setup);
  git('add', '.');
  git('commit', '-m', 'fixture');
  const env = { ...process.env, ARCNEXUS_STATE_DIR: state };
  const run = (...args: any) =>
    spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  const prepare = (...args: any) => run('prepare', '--project', repo, ...args);
  return { root, repo, state, git, env, run, prepare };
}
function writeEnvironment(repo: string, setup: any[]): void {
  writeFileSync(
    join(repo, 'architecture/environment.yaml'),
    JSON.stringify({
      schemaVersion: 1,
      prerequisites: [],
      setup,
      generatedDirectories: ['generated'],
    }),
  );
}
test('built prepare creates a pinned workspace, runs setup there and cleanup retains branch/report', (t: any) =>
  suite.builtPrepareCreatesAPinnedWorkspaceRunsSetupThereAndCleanupRetainsBranchReport_1(t));
test('dirty source is rejected without preparation', (t: any) =>
  suite.dirtySourceIsRejectedWithoutPreparation_2(t));
test('setup failure retains evidence and workspace', (t: any) =>
  suite.setupFailureRetainsEvidenceAndWorkspace_3(t));
test('setup source mutation is rejected and cleanup refuses to lose it', (t: any) =>
  suite.setupSourceMutationIsRejectedAndCleanupRefusesToLoseIt_4(t));
test('cleanup refuses unknown ignored files and untracked files', (t: any) =>
  suite.cleanupRefusesUnknownIgnoredFilesAndUntrackedFiles_5(t));
test('overall timeout retains a failed record', (t: any) =>
  suite.overallTimeoutRetainsAFailedRecord_6(t));
test('SIGINT cancels command and releases lock', (t: any) =>
  suite.SIGINTCancelsCommandAndReleasesLock_7(t));
test('invalid configuration and missing prerequisite fail at their respective stages', (t: any) =>
  suite.invalidConfigurationAndMissingPrerequisiteFailAtTheirRespectiveStages_8(t));
test('lock prevents overlapping operations and ownership tampering refuses cleanup', (t: any) =>
  suite.lockPreventsOverlappingOperationsAndOwnershipTamperingRefusesCleanup_9(t));
test('explicit base remains pinned while source HEAD advances', (t: any) =>
  suite.explicitBaseRemainsPinnedWhileSourceHEADAdvances_10(t));
test('worktree creation does not overwrite a colliding branch or directory', (t: any) =>
  suite.worktreeCreationDoesNotOverwriteACollidingBranchOrDirectory_11(t));

function evidence(f: any, record: any): any {
  const dir = join(f.state, 'runs', record.id);
  const reports = ['report.json', 'report.md'].map((name: any) => readFileSync(join(dir, name)));
  return {
    dir,
    assertReports() {
      for (const [i, name] of ['report.json', 'report.md'].entries()) {
        assert.deepEqual(readFileSync(join(dir, name)), reports[i], `${name} changed`);
      }
    },
  };
}
for (const failed of [false, true])
  test(`cleanup preserves ${failed ? 'failed' : 'successful'} run evidence and receipt on retry`, (t: any) =>
    suite.scenario_12(t, failed));
for (const legacy of [false, true])
  test(`cleanup refuses replacement paths and safely handles ${legacy ? 'legacy' : 'current'} removal`, (t: any) =>
    suite.scenario_13(t, legacy));

test('hard parent death stops a finite setup process group and preserves incomplete evidence', (t: any) =>
  suite.preservesEvidenceAfterParentLoss(t));
test('cleanup reconciles primary removal only with durable matching intent', (t: any) =>
  suite.cleanupReconcilesPrimaryRemovalOnlyWithDurableMatchingIntent_15(t));
test('cleanup refuses unexplained disappearance and replacement after intent', (t: any) =>
  suite.cleanupRefusesUnexplainedDisappearanceAndReplacementAfterIntent_16(t));
