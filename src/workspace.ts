import { assertServicesStopped } from './service-state.js';
import { resolveMembers,prepareMembers,freezeMembers,assertMembers,cleanupMembers,type Member } from './members.js';
import { loadBindings,targetCommand,targetEnvironment,type Bindings } from './bindings.js';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { environment, InputError, type Environment } from './config.js';
import { execute, git } from './process.js';
import { save, type RecordData } from './state.js';
export interface PrepareOptions { project: string; base?: string; issue?: string; bindings?: Bindings }
export function assertOutputs(workspace: string, env: Environment): void {
  if (git(workspace, 'status', '--porcelain', '--untracked-files=all').trim()) throw new Error('Workspace contains changed source or untracked files');
  assertGeneratedOutputs(workspace, env);
}
export function assertGeneratedOutputs(workspace: string, env: Environment): void {
  const ignored = git(workspace, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const path of ignored) if (!env.generatedDirectories.some(dir => path.startsWith(`${dir}/`)) && !env.workspace?.dependencies.some(m=>path===m.path||path.startsWith(m.path+'/'))) throw new Error(`Unknown ignored output: ${path}`);
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
  if((record.members as Member[]|undefined)?.length)assertMembers(record);
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
  record.bindings=options.bindings??loadBindings();
  record.members=resolveMembers(source,base,record.workspace,env,record.bindings as Bindings);
  mkdirSync(join(root,'runs',id), { mode:0o700 }); save(root, record);
  return record;
}
export async function prepareWorkspace(root: string, record: RecordData, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  git(record.source, 'worktree', 'add', '-b', record.branch, record.workspace, record.base);
  await prepareMembers(root,record,signal);
  for (const command of [...record.environment.prerequisites, ...record.environment.setup]) {
    const log = join(root,'runs',record.id,`command-${record.commands.length}.log`);
    try { record.commands.push(await execute(targetCommand(record,command),record.workspace,log,signal,{env:targetEnvironment(record)})); }
    catch (error) { if (error && typeof error === 'object' && 'commandResult' in error) record.commands.push(error.commandResult as RecordData['commands'][number]); throw error; }
    finally { save(root,record); }
  }
  freezeMembers(root,record);assertIdentity(record); assertOutputs(record.workspace,record.environment); record.status='prepared';
}
export function cleanup(root: string, id: string): RecordData {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new InputError('Invalid workspace ID');
  const record = JSON.parse(readFileSync(join(root,'runs',id,'report.json'),'utf8')) as RecordData;
  if (record.id !== id || record.workspace !== join(root,'workspaces',id)) throw new Error('Workspace ownership mismatch');
  if (['preparing','running'].includes(record.status)) throw new Error('Workspace operation is active or incomplete; inspect before cleanup');
  assertServicesStopped(root,id);
  const cleanupPath = join(root,'runs',id,'cleanup.json');
  if (record.status === 'removed' || existsSync(cleanupPath)) {
    if (lstatSync(record.workspace, { throwIfNoEntry: false })) throw new Error('Previously removed workspace path is occupied');
    return { ...record, cleanupStatus: 'removed' };
  }
  if (realpathSync(record.workspace) !== record.workspace) throw new Error('Workspace path is redirected');
  const common = realpathSync(git(record.workspace,'rev-parse','--path-format=absolute','--git-common-dir').trim());
  if (common !== record.commonDir || !git(record.source,'worktree','list','--porcelain','-z').split('\0').includes(`worktree ${record.workspace}`)) throw new Error('Workspace registration mismatch');
  // Use the immutable base configuration rather than potentially edited record settings.
  const env = environment(JSON.parse(git(record.workspace,'show',`${record.base}:architecture/environment.json`)));
  const definitions=env.workspace?.dependencies??[],members=(record.members??[]) as Member[];
  if(definitions.length!==members.length)throw new Error('Dependency ownership record mismatch');
  for(const [i,definition] of definitions.entries()){
    const m=members[i]!;
    if(m.id!==definition.id||m.base!==definition.commit||m.workspace!==join(record.workspace,definition.path))throw new Error('Dependency ownership record mismatch');
    m.definition=definition;
  }
  assertOutputs(record.workspace,env);
  cleanupMembers(root,record);
  git(record.source,'worktree','remove',record.workspace);
  writeFileSync(`${cleanupPath}.tmp`, JSON.stringify({ cleanupStatus: 'removed', removedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${cleanupPath}.tmp`, cleanupPath);
  return { ...record, cleanupStatus: 'removed' };
}
