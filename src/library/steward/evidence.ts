import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../operations/process.js';
import type { RecordData } from '../workspace/state.js';

interface Source {
  path: string;
  source: string;
  available: boolean;
  sha256?: string;
  unavailable?: string;
}

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

const instructionOptions = { maxBuffer: 32 * 1024 * 1024 };

function instructionProvenance(record: RecordData, env: Record<string, string>): Source[] {
  return [...trackedInstructions(record), userInstruction(env)];
}

function trackedInstructions(record: RecordData): Source[] {
  const sources: Source[] = [];
  const options = instructionOptions;
  try {
    const paths = execFileSync(
      'git',
      ['-C', record.source, 'ls-tree', '-rz', '--name-only', record.base],
      options,
    )
      .toString()
      .split('\0')
      .filter((p) => /(^|\/)(AGENTS\.md|SKILL\.md)$/.test(p));
    for (const path of paths) sources.push(trackedInstruction(record, path));
  } catch {
    sources.push({
      path: record.source,
      available: false,
      source: 'target instruction inventory',
      unavailable: 'Unable to enumerate captured base',
    });
  }
  return sources;
}

function trackedInstruction(record: RecordData, path: string): Source {
  const options = instructionOptions;
  try {
    const contents = execFileSync(
      'git',
      ['-C', record.source, 'show', `${record.base}:${path}`],
      options,
    );
    return {
      path,
      available: true,
      sha256: sha256(contents),
      source: 'tracked target instruction at captured base',
    };
  } catch {
    return {
      path,
      available: false,
      source: 'tracked target instruction',
      unavailable: 'Unable to read captured blob',
    };
  }
}

function userInstruction(env: Record<string, string>): Source {
  const userInstructions = join(
    env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(env.HOME ?? homedir(), '.codex'),
    'AGENTS.md',
  );
  try {
    return {
      path: userInstructions,
      available: true,
      sha256: sha256(readFileSync(userInstructions)),
      source: 'available user instruction',
    };
  } catch {
    return {
      path: userInstructions,
      available: false,
      source: 'user instruction',
      unavailable: 'Absent or unreadable',
    };
  }
}

function sdkVersion(): string {
  try {
    let path = dirname(fileURLToPath(import.meta.resolve('@openai/codex-sdk')));
    while (path !== dirname(path)) {
      const manifest = join(path, 'package.json');
      if (existsSync(manifest)) {
        const data = JSON.parse(readFileSync(manifest, 'utf8'));
        if (data.name === '@openai/codex-sdk') return data.version;
      }
      path = dirname(path);
    }
  } catch {
    /* explicit unavailable value below */
  }
  return 'unavailable';
}

async function cliVersion(
  executable: string,
  env: Record<string, string>,
  record: RecordData,
  log: string,
  signal: AbortSignal,
) {
  try {
    await execute({ command: executable, args: ['--version'] }, record.workspace, log, signal, {
      env,
    });
    return { available: true, output: readFileSync(log, 'utf8').trim().slice(0, 2048) };
  } catch (error) {
    signal.throwIfAborted();
    return {
      available: false,
      unavailable: String(error),
      output: existsSync(log) ? readFileSync(log, 'utf8').slice(0, 2048) : '',
    };
  }
}

export async function persistExecutionEvidence(
  root: string,
  record: RecordData,
  prompt: string,
  executable: string,
  settings: Record<string, unknown>,
  schema: unknown,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<void> {
  const dir = join(root, 'runs', record.id);
  writeFileSync(join(dir, 'prompt.txt'), prompt, { mode: 0o600 });
  writeFileSync(join(dir, 'response-schema.json'), JSON.stringify(schema, null, 2) + '\n', {
    mode: 0o600,
  });
  const version = await cliVersion(
    executable,
    env,
    record,
    join(dir, `cli-version-${Number(record.turns && (record.turns as unknown[]).length)}.log`),
    signal,
  );
  const manifest = executionManifest(record, settings, env, version);
  writeFileSync(join(dir, 'execution.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
}

function executionManifest(
  record: RecordData,
  settings: Record<string, unknown>,
  env: Record<string, string>,
  version: unknown,
) {
  const manifest = {
    settings,
    capabilities: {
      webSearch: settings.webSearch,
      localNetwork: settings.network,
      nestedDelegation: settings.nestedDelegation,
    },
    sdk: { version: sdkVersion() },
    cliVersion: version,
    instructionProvenance: instructionProvenance(record, env),
    provenanceScope:
      'Available source hashes, not a complete effective Codex context or tool inventory',
  };
  return manifest;
}
