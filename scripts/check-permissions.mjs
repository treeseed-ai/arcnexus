import { preparePermissions } from '../dist/permissions.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const codex = process.env.CODEX_PATH ?? 'codex';
const root = mkdtempSync(join(tmpdir(), 'arcnexus-permission-acceptance-'));
try {
  const project=join(root,'project');mkdirSync(project);
  const home = join(root, 'codex-home'), work = join(project, 'work'), related = join(project, 'related'), unrelated = join(project, 'unrelated');
  mkdirSync(home); mkdirSync(work); mkdirSync(related); mkdirSync(unrelated);
  const file = join(related, 'related.txt'), secret = join(unrelated, 'secret.txt');
  writeFileSync(file, 'related'); writeFileSync(secret, 'secret');
  const permissions=preparePermissions(project,{readPaths:['related'],writeDirectories:['work']},['work/allowed.txt'],join(home,'tmp'));
  const probe = `import os, pathlib, sys
work, related, unrelated = map(pathlib.Path, sys.argv[1:])
(work / 'allowed.txt').write_text('allowed')
assert (related / 'related.txt').read_text() == 'related'
for path, operation in [(related / 'related.txt', 'write'), (unrelated / 'secret.txt', 'read'), (unrelated / 'new.txt', 'write')]:
    try:
        if operation == 'read': path.read_text()
        else: path.write_text('forbidden')
    except (PermissionError, OSError): pass
    else: raise AssertionError(f'{operation} unexpectedly allowed: {path}')
`;
  const args = ['sandbox', '--permission-profile', 'arcnexus', '--cd', work, ...permissions.configOverrides.flatMap(value=>['--config',value]), '--', 'python3', '-c', probe, work, related, unrelated];
  let result;
  try { result = spawnSync(codex, args, { cwd: work, env: { ...process.env, CODEX_HOME: home, CODEX_CONFIG: undefined }, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 }); }
  catch (error) { throw new Error(`Codex sandbox acceptance could not start: ${error instanceof Error ? error.message : String(error)}`); }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Codex sandbox acceptance failed (${result.status}): ${result.stderr || result.stdout}`);
  console.log('Codex directory permission acceptance passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
