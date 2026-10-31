import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stateRoot } from '../dist/workspace/state.js';
const supervisor = resolve(import.meta.dirname, '..');
const samples = join(stateRoot(), 'samples');
mkdirSync(samples, { recursive: true, mode: 0o700 });
const root = mkdtempSync(join(samples, 'identity-'));
const source = join(root, 'source');
cpSync(join(supervisor, 'fixtures/identity'), source, { recursive: true, filter: p => !p.split('/').includes('node_modules') });
function command(executable, args, cwd = supervisor) {
  const r = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 950_000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${executable} failed: ${r.error ?? r.stderr}\n${r.stdout}`);
  return r.stdout;
}
for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'ArcNexus acceptance'], ['config', 'user.email', 'acceptance@example.invalid'], ['add', '.'], ['commit', '-m', 'Identity acceptance baseline']]) command('git', args, source);
const objective = 'Add and export isSessionExpired(expiresAtMs, nowMs) in src/identity.mjs. Return nowMs >= expiresAtMs. Document the behavior in README.md, add tests for before, exactly at, and after expiry, and preserve normalizeIdentity. Document first, observe the new tests fail before implementing, then verify.';
const results = [];
for (let attempt = 1; attempt <= 2; attempt++) {
  console.error(`Live sample ${attempt}/2; evidence root: ${root}`);
  const output = command(process.execPath, ['dist/cli.js', 'run', 'identity', objective, '--project', source]);
  writeFileSync(join(root, `run-${attempt}.json`), output, { mode: 0o600 });
  const record = JSON.parse(output);
  assert.equal(record.status, 'completed');
  assert.ok(record.changes.some(c => c.path === 'README.md'));
  assert.ok(record.changes.some(c => c.path.startsWith('tests/')));
  const acceptance = command(process.execPath, ['scripts/check-sample.mjs', record.workspace]);
  writeFileSync(join(root, `acceptance-${attempt}.log`), acceptance);
  assert.equal(command('git', ['status', '--porcelain'], source), '');
  results.push({ id: record.id, base: record.base, workspace: record.workspace, threadId: record.threadId });
  console.error(`Live sample ${attempt} independently verified: ${record.id}`);
}
assert.equal(results[0].base, results[1].base);
assert.notEqual(results[0].workspace, results[1].workspace);
writeFileSync(join(root, 'acceptance.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ root, results }, null, 2));
