import { posix } from 'node:path';
import { validateSchema } from './schema.js';

/** Distinguishes invalid invocation or configuration from execution failures. */
export class InputError extends Error {}

export interface Command {
  command: string;
  args: string[];
}

export interface Dependency {
  id: string;
  repository: string;
  commit: string;
  path: string;
  prerequisites: Command[];
  setup: Command[];
  generatedDirectories: string[];
}

export interface WorkspaceDefinition {
  primary: { id: string; repository: string };
  dependencies: Dependency[];
}

export interface Environment {
  workspace?: WorkspaceDefinition;
  schemaVersion: 1;
  prerequisites: Command[];
  setup: Command[];
  generatedDirectories: string[];
}

export function relativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value === '.' ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    posix.normalize(value) !== value ||
    value.split('/').some((p) => p === '..' || p.toLowerCase() === '.git')
  )
    throw new InputError(`Invalid relative path: ${String(value)}`);
  return value;
}

export function commands(value: unknown): Command[] {
  if (!Array.isArray(value)) throw new InputError('Expected command array');
  return value.map((c) => {
    if (
      !c ||
      typeof c.command !== 'string' ||
      !c.command ||
      c.command.includes('\0') ||
      !Array.isArray(c.args) ||
      !c.args.every((a: unknown) => typeof a === 'string' && !a.includes('\0'))
    )
      throw new InputError('Invalid command/args');
    return { command: c.command, args: c.args };
  });
}

export function environment(value: unknown): Environment {
  let v: Environment;
  try {
    v = validateSchema<Environment>('environment', value);
  } catch (error) {
    throw new InputError(String(error));
  }
  if (!v || !Array.isArray(v.generatedDirectories))
    throw new InputError('Invalid environment definition');
  validateWorkspace(v);
  return {
    ...(v.workspace ? { workspace: v.workspace } : {}),
    schemaVersion: 1,
    prerequisites: commands(v.prerequisites),
    setup: commands(v.setup),
    generatedDirectories: v.generatedDirectories.map(relativePath),
  };
}

function validateWorkspace(v: Environment): void {
  if (v.workspace) {
    const seen = new Set([v.workspace.primary.id]);
    const paths: string[] = [];
    for (const member of v.workspace.dependencies) {
      relativePath(member.path);
      commands(member.prerequisites);
      commands(member.setup);
      member.generatedDirectories.forEach(relativePath);
      if (seen.has(member.id)) throw new InputError('Duplicate workspace member identity');
      seen.add(member.id);
      if (
        paths.some(
          (p) =>
            p === member.path || p.startsWith(member.path + '/') || member.path.startsWith(p + '/'),
        )
      )
        throw new InputError('Overlapping dependency mounts');
      paths.push(member.path);
      if (
        v.generatedDirectories.some(
          (p) =>
            p === member.path || p.startsWith(member.path + '/') || member.path.startsWith(p + '/'),
        )
      )
        throw new InputError('Dependency mount overlaps disposable generated directory');
    }
  }
}

/** Only explicitly selected limits constrain work; undefined means unconfigured. */
export function milliseconds(seconds?: number): number | undefined {
  return seconds === undefined ? undefined : seconds * 1000;
}

export function minimumLimit(...values: Array<number | undefined>): number | undefined {
  const configured = values.filter((value): value is number => value !== undefined);
  return configured.length ? Math.min(...configured) : undefined;
}

export function capturedCommandTimeout(record: {
  [key: string]: unknown;
  resolvedAssignment?: unknown;
  preparationCommandTimeoutSeconds?: unknown;
}): number | undefined {
  const resolved = record.resolvedAssignment as
    { executionProfile?: { commandTimeoutSeconds?: number } } | undefined;
  const limit =
    record.preparationCommandTimeoutSeconds ?? resolved?.executionProfile?.commandTimeoutSeconds;
  return typeof limit === 'number' ? milliseconds(limit) : undefined;
}
