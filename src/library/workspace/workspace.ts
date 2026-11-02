import { WorkspaceOperations } from './operation-preparation.js';
import { capturedCommandTimeout } from '../architecture/config.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  loadBindings,
  targetCommand,
  targetEnvironment,
  type Bindings,
} from '../architecture/bindings.js';
import { environment, InputError, type Environment } from '../architecture/config.js';
import { ConfigurationReader } from '../architecture/configuration.js';
import { execute, git } from '../operations/process.js';
import { observe } from '../report/timeline.js';
import { WorkspaceCleanup } from './cleanup.js';
import {
  assertMembers,
  freezeMembers,
  prepareMembers,
  resolveMembers,
  type Member,
} from './members.js';
import { assertOutputs } from './outputs.js';
import { save, type RecordData } from './state.js';

export { assertGeneratedOutputs, assertOutputs } from './outputs.js';

export interface PrepareOptions {
  project: string;
  base?: string;
  authorityBase?: string;
  packageId?: string;
  issue?: string;
  bindings?: Bindings;
}

export function assertIdentity(record: RecordData): void {
  if (
    git(record.workspace, 'rev-parse', 'HEAD').trim() !== record.base ||
    git(record.workspace, 'branch', '--show-current').trim() !== record.branch
  )
    throw new Error('Candidate branch or HEAD changed');
  if ((record.members as Member[] | undefined)?.length) assertMembers(record);
}

export function createWorkspace(root: string, options: PrepareOptions): RecordData {
  const { source, base, env, commonDir } = inspectSource(options);
  const id = randomUUID(),
    branch = `codex/${options.issue ?? 'run'}-${id}`;
  const record: RecordData = {
    id,
    source,
    base,
    commonDir,
    branch,
    workspace: join(root, 'workspaces', id),
    status: 'preparing',
    startedAt: new Date().toISOString(),
    environment: env,
    commands: [],
  };
  record.bindings = options.bindings ?? loadBindings();
  captureConfiguration(record, options);
  WorkspaceOperations.capture(
    record,
    options.project,
    options.authorityBase ?? record.base,
    options.packageId,
  );
  mkdirSync(join(root, 'runs', id), { mode: 0o700 });
  save(root, record);
  observe(root, record, 'run.created', { base, branch, workspace: record.workspace });
  return record;
}

/** Captures workspace setup authority separately from the accumulated candidate revision. */
function captureConfiguration(record: RecordData, options: PrepareOptions): void {
  record.configurationSources = [
    new ConfigurationReader().definition(
      record.source,
      options.authorityBase ?? record.base,
      'architecture/environment',
    ),
    ...(options.bindings?.configurationSource ? [options.bindings.configurationSource] : []),
  ];
  record.members = resolveMembers(
    record.source,
    options.authorityBase ?? record.base,
    record.workspace,
    record.environment,
    record.bindings as Bindings,
  );
}

export async function prepareWorkspace(
  root: string,
  record: RecordData,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  git(record.source, 'worktree', 'add', '-b', record.branch, record.workspace, record.base);
  observe(root, record, 'workspace.created', { workspace: record.workspace, base: record.base });
  const shared =
    record.environment.schemaVersion === 4
      ? new WorkspaceOperations(root, record, signal)
      : undefined;
  await prepareMembers(
    root,
    record,
    signal,
    shared ? (member) => shared.member(member) : undefined,
  );
  observe(root, record, 'workspace.members', { members: record.members });
  if (shared) await shared.primary();
  for (const command of [...record.environment.prerequisites, ...record.environment.setup])
    await prepareCommand(root, record, signal, command);
  freezeMembers(root, record);
  assertIdentity(record);
  assertOutputs(record.workspace, record.environment);
  record.status = 'prepared';
  observe(root, record, 'workspace.prepared', { members: record.members });
  save(root, record);
}

export function cleanup(root: string, id: string): RecordData {
  return new WorkspaceCleanup(root, id).run();
}

function inspectSource(options: PrepareOptions) {
  let source: string, base: string, env: Environment, commonDir: string;
  try {
    source = realpathSync(git(resolve(options.project), 'rev-parse', '--show-toplevel').trim());
    if (git(source, 'status', '--porcelain', '--untracked-files=all').trim())
      throw new Error('Source checkout must be clean');
    base = git(
      source,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${options.base ?? 'HEAD'}^{commit}`,
    ).trim();
    env = environment(
      new ConfigurationReader().definition(
        source,
        options.authorityBase ?? base,
        'architecture/environment',
      ).value,
    );
    assertNoSubmodules(source, base);
    commonDir = realpathSync(
      git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    );
  } catch (error) {
    throw new InputError(String(error));
  }
  return { source, base, env, commonDir };
}

async function prepareCommand(
  root: string,
  record: RecordData,
  signal: AbortSignal,
  command: import('../architecture/config.js').Command,
): Promise<void> {
  const log = join(root, 'runs', record.id, `command-${record.commands.length}.log`);
  observe(root, record, 'setup.started', { command, workspace: record.workspace });
  try {
    record.commands.push(
      await execute(targetCommand(record, command), record.workspace, log, signal, {
        env: targetEnvironment(record),
        timeoutMs: capturedCommandTimeout(record),
      }),
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'commandResult' in error)
      record.commands.push(error.commandResult as RecordData['commands'][number]);
    throw error;
  } finally {
    observe(root, record, 'setup.result', record.commands.at(-1) ?? { status: 'interrupted' });
    save(root, record);
  }
}

function assertNoSubmodules(source: string, base: string): void {
  if (
    git(source, 'ls-tree', '-r', base)
      .split('\n')
      .some((line) => line.startsWith('160000 '))
  )
    throw new Error('Submodules are unsupported');
}
