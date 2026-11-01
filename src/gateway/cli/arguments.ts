import { parseArgs } from 'node:util';
import { InputError } from '../../library/architecture/config.js';

export const help = `ArcNexus
  test inspect|run [component-id] --project <repository> [--level unit|integration|acceptance] [--category regression] [--tag <tag>] [--json]
  run <component-id> <objective> --project <repository> [--model <model>] [--codex-path <executable>] [--max-attempts <count>]
  workday run <manifest> --project <repository> [--base <ref>] [--issue <number>] [--codex-path <executable>]
  workday inspect <manifest> --project <repository> [--base <ref>] [--bindings <file>] [--json]
  workday status <workday-id> [--json]
  workday follow <workday-id> [--json] [--after <sequence>]
  experiment inspect <manifest> --bindings <file> [--json]
  experiment run <manifest> --bindings <file> --mode simulation|live [--output <new-directory>]
  guidance validate --project <repository> [--json]
  validate --project <repository> [--base <ref>]
  inspect <component-id> <objective> --project <repository> [--kind change|research|review] [--json]
  run/inspect: --assignment <file> replaces objective
  task plan --input <text-file> --project <repository> [--initializer-model <model>]
  task inspect <proposal-id> [--json]
  task run <proposal-id>
  prepare --project <repository>
  status <workspace-id> [--json]\n  follow <workspace-id> [--json] [--after <sequence>]\n  cleanup <workspace-id>
Composed workspaces: prepare/run/inspect --bindings <file>
Shared run/prepare options: --base <ref> --issue <number> --timeout-seconds <seconds>
`;

const cliOptions = {
  level: { type: 'string' },
  category: { type: 'string' },
  tag: { type: 'string', multiple: true },
  mode: { type: 'string' },
  output: { type: 'string' },
  bindings: { type: 'string' },
  after: { type: 'string' },
  'composition-profile': { type: 'string' },
  'execution-profile': { type: 'string' },
  assignment: { type: 'string' },
  kind: { type: 'string' },
  json: { type: 'boolean' },
  project: { type: 'string' },
  input: { type: 'string' },
  model: { type: 'string' },
  'initializer-model': { type: 'string' },
  'codex-path': { type: 'string' },
  'max-attempts': { type: 'string' },
  base: { type: 'string' },
  issue: { type: 'string' },
  'timeout-seconds': { type: 'string' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

export function argumentsForCommand() {
  try {
    const parsed = parseArgs({
      allowPositionals: true,
      options: cliOptions,
    });
    if (
      parsed.positionals[0] !== 'test' &&
      (parsed.values.level || parsed.values.category || parsed.values.tag)
    )
      throw new InputError('Test filters require the test command');
    return parsed;
  } catch (error) {
    throw new InputError(String(error));
  }
}

export type CliValues = Omit<ReturnType<typeof argumentsForCommand>['values'], 'tag'>;
