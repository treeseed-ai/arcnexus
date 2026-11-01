import { parseArgs } from 'node:util';
import { InputError } from '../../library/architecture/config.js';

export const help = `ArcNexus
  workday start|pause|resume|stop|status
  task run "<prompt>"
  test inspect|run [component-id] --project <repository> [--level unit|integration|acceptance] [--category regression] [--tag <tag>] [--json]
Inspection, evidence and diagnostics:
  inspect <component-id> <objective> --project <repository> [--kind change|research|review] [--json]
  inspect: --assignment <file> replaces objective
  validate --project <repository> [--base <ref>]
  guidance validate --project <repository> [--json]
  experiment inspect <manifest> --bindings <file> [--json]
  experiment run <prompt-manifest> --bindings <file> --mode simulation|live [--output <new-directory>]
  workday inspect <historical-manifest> --project <repository> [--base <ref>] [--bindings <file>] [--json]
  workday history <historical-workday-id> [--json]
  workday follow <historical-workday-id> [--json] [--after <sequence>]
  task inspect <historical-proposal-id> [--json]
  prepare --project <repository>
  status <workspace-id> [--json]
  follow <workspace-id> [--json] [--after <sequence>]
  cleanup <workspace-id>
Composed workspace inspection/preparation: --bindings <file>
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
