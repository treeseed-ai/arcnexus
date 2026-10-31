import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { environment, InputError, type Environment } from './config.js';
import { execute, git } from './process.js';
import { save, type RecordData } from './state.js';
export interface PrepareOptions { project: string; base?: string; issue?: string }
export function assertOutputs(workspace: string, env: Environment): void {
  if (git(workspace, 'status', '--porcelain', '--untracked-files=all').trim()) throw new Error('Workspace contains changed source or untracked files');
  const ignored = git(workspace, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const path of ignored) if (!env.generatedDirectories.some(dir => path.startsWith(`${dir}/`))) throw new Error(`Unknown ignored output: ${path}`);
  for (const path of env.generatedDirectories) {
    const segments = path.split('/');
    for (let i=1; i<=segments.length; i++) {
      const p=join(workspace,...segments.slice(0,i));
      if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`Generated directory is a symlink: ${path}`);
    }
  }
}
export function assertIdentity(record: RecordData): void {
  if (git(record.workspace, 'rev-parse', 'HEAD').trim() !== record.base || git(record.workspace, 'branch', '--show-current').trim() !== record.branch) throw new Error('Candidate branch or HEAD changed');
}
export function createWorkspace(root: string, options: PrepareOptions): RecordData {
  let source: string, base: string, env: Environment, commonDir: string;
  try {
    source = realpathSync(git(resolve(options.project), 'rev-parse', '--show-toplevel').trim());
    if (git(source, 'status', '--porcelain', '--untracked-files=all').trim()) throw new Error('Source checkout must be clean');
    base = git(source, 'rev-parse', '--verify', '--end-of-options', `${options.base ?? 'HEAD'}^{commit}`).trim();
    env = environment(JSON.parse(git(source, 'show', `${base}:architecture/environment.json`)));
    if (git(source, 'ls-tree', '-r', base).split('\n').some(line => line.startsWith('160000 '))) throw new Error('Submodules are unsupported');
    commonDir = realpathSync(git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim());
  } catch (error) { throw new InputError(String(error)); }
  const id = randomUUID(), branch = `codex/${options.issue ?? 'run'}-${id}`;
  const record: RecordData = { id, source, base, commonDir, branch, workspace: join(root, 'workspaces', id), status: 'preparing', startedAt: new Date().toISOString(), environment: env, commands: [] };
  mkdirSync(join(root,'runs',id), { mode:0o700 }); save(root, record);
  return record;
}
export async function prepareWorkspace(root: string, record: RecordData, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  git(record.source, 'worktree', 'add', '-b', record.branch, record.workspace, record.base);
  for (const command of [...record.environment.prerequisites, ...record.environment.setup]) {
    const log = join(root,'runs',record.id,`command-${record.commands.length}.log`);
    try { record.commands.push(await execute(command,record.workspace,log,signal)); }
    catch (error) { if (error && typeof error === 'object' && 'commandResult' in error) record.commands.push(error.commandResult as RecordData['commands'][number]); throw error; }
    finally { save(root,record); }
  }
  assertIdentity(record); assertOutputs(record.workspace,record.environment); record.status='prepared';
}
export function cleanup(root: string, id: string): RecordData {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new InputError('Invalid workspace ID');
  const record = JSON.parse(readFileSync(join(root,'runs',id,'report.json'),'utf8')) as RecordData;
  if (record.id !== id || record.workspace !== join(root,'workspaces',id)) throw new Error('Workspace ownership mismatch');
  if (record.status === 'removed') return record;
  if (['preparing','running'].includes(record.status)) throw new Error('Workspace operation is active or incomplete; inspect before cleanup');
  if (realpathSync(record.workspace) !== record.workspace) throw new Error('Workspace path is redirected');
  const common = realpathSync(git(record.workspace,'rev-parse','--path-format=absolute','--git-common-dir').trim());
  if (common !== record.commonDir || !git(record.source,'worktree','list','--porcelain','-z').split('\0').includes(`worktree ${record.workspace}`)) throw new Error('Workspace registration mismatch');
  // Use the immutable base configuration rather than potentially edited record settings.
  const env = environment(JSON.parse(git(record.workspace,'show',`${record.base}:architecture/environment.json`)));
  assertOutputs(record.workspace,env);
  git(record.source,'worktree','remove',record.workspace);
  record.status='removed'; save(root,record); return record;
}
