import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const cli = resolve('dist/cli.js');

export function cleanupIntent(record: any) {
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

export function fixture(t: any, setup: any = []): any {
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

export function writeEnvironment(repo: string, setup: any[]): void {
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

export function evidence(f: any, record: any): any {
  const dir = join(f.state, 'runs', record.id);
  const reports = ['report.json', 'report.md'].map((name: any) => readFileSync(join(dir, name)));
  return {
    dir,
    /** Requires cleanup to preserve the original JSON and Markdown report bytes. */
    assertReports() {
      for (const [i, name] of ['report.json', 'report.md'].entries()) {
        assert.deepEqual(readFileSync(join(dir, name)), reports[i], `${name} changed`);
      }
    },
  };
}
