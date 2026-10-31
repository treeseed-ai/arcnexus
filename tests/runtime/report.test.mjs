import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { markdownReport } from '../../dist/report.js';

const record = { id: 'execution', status: 'failed', objective: 'Improve report', workspace: '/captured', base: 'abc', error: 'failure evidence', commands: [{}] };
const section = report => report.split('## Changed files\n\n')[1]?.split('\n\n')[0];

test('changed files are sorted independently of input and preserve captured evidence', () => {
  const changes = Object.freeze([
    Object.freeze({ path: 'z.txt', kind: '?' }),
    Object.freeze({ path: 'a.txt', kind: 'D' }),
    Object.freeze({ path: 'B.txt', kind: 'M' }),
  ]);
  const captured = Object.freeze({ ...record, changes });
  const before = JSON.stringify(captured);
  const report = markdownReport(captured);
  assert.equal(section(report), '- <code>B.txt</code> — M\n- <code>a.txt</code> — D\n- <code>z.txt</code> — ?');
  assert.equal(markdownReport({ ...record, changes: [...changes].reverse() }), report);
  assert.equal(JSON.stringify(captured), before);
  for (const field of ['# ArcNexus execution execution', 'Status: failed', 'Objective: Improve report', 'Workspace: /captured', 'Base: abc', 'Failure: failure evidence', 'Commands recorded: 1', 'See report.json, events.jsonl, changes.patch and command logs for evidence.']) assert.ok(report.includes(field), field);
});

test('absent and empty changes have an explicit empty section', () => {
  for (const captured of [record, { ...record, changes: [] }]) {
    assert.equal(section(markdownReport(captured)), 'No changed files observed.');
  }
});

test('filenames remain text instead of Markdown or HTML', () => {
  const path = '[link](https://bad) `code` <img> &amp;\n# heading\r\t*em*_x|';
  const report = markdownReport({ ...record, changes: [{ path, kind: 'A' }] });
  assert.equal(section(report), '- <code>&#91;link&#93;&#40;https&#58;//bad&#41; &#96;code&#96; &#60;img&#62; &#38;amp&#59;&#10;&#35; heading&#13;&#9;&#42;em&#42;&#95;x&#124;</code> — A');
});

test('built CLI run writes observed changed paths and Git kinds into Markdown', t => {
  const root = mkdtempSync(join(tmpdir(), 'arcnexus-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), state = join(root, 'state');
  mkdirSync(join(repo, 'architecture/components'), { recursive: true });
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, String(result.error ?? result.stderr));
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(repo, 'z.txt'), 'before');
  writeFileSync(join(repo, 'deleted.txt'), 'remove');
  writeFileSync(join(repo, 'architecture/environment.json'), JSON.stringify({ prerequisites: [], setup: [], generatedDirectories: [] }));
  writeFileSync(join(repo, 'architecture/components/sample.json'), JSON.stringify({
    id: 'sample', type: 'library', purpose: 'report acceptance', path: 'z.txt', objectives: [], constraints: [],
    allowedWritePaths: ['z.txt', 'a[1].txt', 'deleted.txt'],
    verification: [{ command: 'node', args: ['-e', 'process.exit(0)'] }],
  }));
  git('add', '.'); git('commit', '-m', 'fixture');
  const executable = join(root, 'controlled-codex');
  writeFileSync(executable, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
process.chdir(args[args.indexOf('--cd') + 1]);
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync('z.txt', 'after');
  fs.writeFileSync('a[1].txt', 'new');
  fs.unlinkSync('deleted.txt');
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'report-test' }));
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'final', type: 'agent_message', text: JSON.stringify({ status: 'completed', summary: 'fixture changes', blockers: [] }) } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }));
});
`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [resolve('dist/cli.js'), 'run', 'sample', 'Exercise report', '--project', repo, '--codex-path', executable], {
    encoding: 'utf8', env: { ...process.env, ARCNEXUS_STATE_DIR: state }, timeout: 20000,
  });
  assert.equal(result.status, 0, String(result.error ?? result.stderr));
  const captured = JSON.parse(result.stdout);
  assert.equal(captured.status, 'completed');
  const run = join(state, 'runs', captured.id);
  const evidence = JSON.parse(readFileSync(join(run, 'report.json'), 'utf8'));
  assert.deepEqual(evidence.changes, [{ path: 'a[1].txt', kind: '?' }, { path: 'deleted.txt', kind: 'D' }, { path: 'z.txt', kind: 'M' }]);
  assert.equal(section(readFileSync(join(run, 'report.md'), 'utf8')), '- <code>a&#91;1&#93;.txt</code> — ?\n- <code>deleted.txt</code> — D\n- <code>z.txt</code> — M');
});
