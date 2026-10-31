import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordData } from './state.js';

interface Source { path: string; source: string; available: boolean; sha256?: string; unavailable?: string }
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function instructionProvenance(record: RecordData, env: Record<string, string>): Source[] {
  const sources: Source[] = [];
  const options = { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 };
  try {
    const paths = execFileSync('git', ['-C', record.source, 'ls-tree', '-rz', '--name-only', record.base], options).toString().split('\0').filter(p => /(^|\/)(AGENTS\.md|SKILL\.md)$/.test(p));
    for (const path of paths) {
      try {
        const contents = execFileSync('git', ['-C', record.source, 'show', `${record.base}:${path}`], options);
        sources.push({ path, available: true, sha256: sha256(contents), source: 'tracked target instruction at captured base' });
      } catch { sources.push({path, available: false, source: 'tracked target instruction', unavailable: 'Unable to read captured blob'}); }
    }
  } catch { sources.push({path: record.source, available: false, source: 'target instruction inventory', unavailable: 'Unable to enumerate captured base'}); }
  const userInstructions = join(env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(env.HOME ?? homedir(), '.codex'), 'AGENTS.md');
  try { sources.push({path:userInstructions, available:true, sha256:sha256(readFileSync(userInstructions)), source:'available user instruction'}); }
  catch { sources.push({path:userInstructions, available:false, source:'user instruction', unavailable:'Absent or unreadable'}); }
  return sources;
}
function sdkVersion(): string {
  try {
    let path = dirname(fileURLToPath(import.meta.resolve('@openai/codex-sdk')));
    while (path !== dirname(path)) {
      const manifest = join(path, 'package.json');
      if (existsSync(manifest)) { const data = JSON.parse(readFileSync(manifest, 'utf8')); if (data.name === '@openai/codex-sdk') return data.version; }
      path = dirname(path);
    }
  } catch { /* explicit unavailable value below */ }
  return 'unavailable';
}
function cliVersion(executable: string, env: Record<string,string>) {
  const result = spawnSync(executable, ['--version'], { env, encoding: 'utf8', timeout: 1500, maxBuffer: 4096 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().slice(0, 2048);
  return result.error || result.status !== 0
    ? { available:false, output, unavailable:result.error?.message ?? `exit ${result.status}` }
    : { available:true, output };
}
export function persistExecutionEvidence(root: string, record: RecordData, prompt: string, executable: string, settings: Record<string, unknown>, schema: unknown, env: Record<string,string>): void {
  const dir = join(root, 'runs', record.id);
  writeFileSync(join(dir, 'prompt.txt'), prompt, { mode: 0o600 });
  writeFileSync(join(dir, 'response-schema.json'), JSON.stringify(schema, null, 2) + '\n', { mode: 0o600 });
  const manifest = { settings, capabilities: { webSearch:settings.webSearch, localNetwork:settings.network, nestedDelegation:settings.nestedDelegation }, sdk:{version:sdkVersion()}, cliVersion:cliVersion(executable, env), instructionProvenance:instructionProvenance(record, env), provenanceScope:'Available source hashes, not a complete effective Codex context or tool inventory' };
  writeFileSync(join(dir, 'execution.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
}
