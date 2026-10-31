import { assertOutputs, assertGeneratedOutputs } from './outputs.js';
export { assertOutputs, assertGeneratedOutputs } from './outputs.js';
import { ConfigurationReader } from "../architecture/configuration.js";
import { observe, readTimeline } from "../report/timeline.js";
import { assertServicesStopped } from "../operations/service-state.js";
import { resolveMembers,prepareMembers,freezeMembers,assertMembers,cleanupMembers,type Member } from "./members.js";
import { loadBindings,targetCommand,targetEnvironment,type Bindings } from "../architecture/bindings.js";
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { environment, InputError, type Environment } from "../architecture/config.js";
import { execute, git } from "../operations/process.js";
import { save, type RecordData } from "./state.js";
export interface PrepareOptions { project: string; base?: string; issue?: string; bindings?: Bindings }
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
    env = environment(new ConfigurationReader().definition(source,base,'architecture/environment').value);
    if (git(source, 'ls-tree', '-r', base).split('\n').some(line => line.startsWith('160000 '))) throw new Error('Submodules are unsupported');
    commonDir = realpathSync(git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim());
  } catch (error) { throw new InputError(String(error)); }
  const id = randomUUID(), branch = `codex/${options.issue ?? 'run'}-${id}`;
  const record: RecordData = { id, source, base, commonDir, branch, workspace: join(root, 'workspaces', id), status: 'preparing', startedAt: new Date().toISOString(), environment: env, commands: [] };
  record.bindings=options.bindings??loadBindings();
  record.configurationSources=[new ConfigurationReader().definition(source,base,'architecture/environment'),...(options.bindings?.configurationSource?[options.bindings.configurationSource]:[])];
  record.members=resolveMembers(source,base,record.workspace,env,record.bindings as Bindings);
  mkdirSync(join(root,'runs',id), { mode:0o700 }); save(root, record);observe(root,record,'run.created',{base,branch,workspace:record.workspace});
  return record;
}
export async function prepareWorkspace(root: string, record: RecordData, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  git(record.source, 'worktree', 'add', '-b', record.branch, record.workspace, record.base);
  observe(root,record,'workspace.created',{workspace:record.workspace,base:record.base});
  await prepareMembers(root,record,signal);observe(root,record,'workspace.members',{members:record.members});
  for (const command of [...record.environment.prerequisites, ...record.environment.setup]) {
    const log = join(root,'runs',record.id,`command-${record.commands.length}.log`);
    observe(root,record,'setup.started',{command,workspace:record.workspace});
    try { record.commands.push(await execute(targetCommand(record,command),record.workspace,log,signal,{env:targetEnvironment(record)})); }
    catch (error) { if (error && typeof error === 'object' && 'commandResult' in error) record.commands.push(error.commandResult as RecordData['commands'][number]); throw error; }
    finally { observe(root,record,'setup.result',record.commands.at(-1)??{status:'interrupted'});save(root,record); }
  }
  freezeMembers(root,record);assertIdentity(record); assertOutputs(record.workspace,record.environment); record.status='prepared';observe(root,record,'workspace.prepared',{members:record.members});save(root,record);
}
export function cleanup(root: string, id: string): RecordData {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new InputError('Invalid workspace ID');
  const record = JSON.parse(readFileSync(join(root,'runs',id,'report.json'),'utf8')) as RecordData;
  if (record.id !== id || record.workspace !== join(root,'workspaces',id)) throw new Error('Workspace ownership mismatch');
  if (['preparing','running'].includes(record.status)) throw new Error('Workspace operation is active or incomplete; inspect before cleanup');
  assertServicesStopped(root,id);
  if(record.workday){const workday=record.workday as {assignments:string[];parking:string;active?:boolean};if(workday.active)throw new Error('Workday is active or interrupted; inspect before cleanup');for(const child of workday.assignments)assertServicesStopped(root,child);if(existsSync(workday.parking)){const parking=JSON.parse(readFileSync(workday.parking,'utf8'));if(!['none','restored'].includes(parking.status))throw new Error('Workday parking/restoration is unresolved');}}
  const cleanupPath = join(root,'runs',id,'cleanup.json');
  if (record.status === 'removed' || existsSync(cleanupPath)) {
    if (lstatSync(record.workspace, { throwIfNoEntry: false })) throw new Error('Previously removed workspace path is occupied');
    return { ...record, cleanupStatus: 'removed' };
  }
  const intentPath = join(root,'runs',id,'cleanup-intent.json');
  const members = (record.members ?? []) as Member[];
  const identity = {schemaVersion:1,id,source:record.source,commonDir:record.commonDir,base:record.base,branch:record.branch,workspace:record.workspace,members};
  const intent = existsSync(intentPath) ? JSON.parse(readFileSync(intentPath,'utf8')) : undefined;
  if (intent && Object.entries(identity).some(([key,value]) => JSON.stringify(intent[key]) !== JSON.stringify(value))) throw new Error('Cleanup intent ownership mismatch');
  const registered = (source:string,path:string) => git(source,'worktree','list','--porcelain','-z').split('\0').includes(`worktree ${path}`);
  const writeIntent = (value:unknown) => {writeFileSync(intentPath+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(intentPath+'.tmp',intentPath);};
  const stat = lstatSync(record.workspace,{throwIfNoEntry:false});
  if (!stat) {
    if (!intent || !['removing','removed'].includes(intent.status)) throw new Error('Workspace disappeared without cleanup intent');
    if (realpathSync(git(record.source,'rev-parse','--path-format=absolute','--git-common-dir').trim()) !== record.commonDir || registered(record.source,record.workspace)) throw new Error('Absent workspace ownership is unresolved');
    const progress = join(root,'runs',id,'members-cleanup.json');
    const removed = existsSync(progress) ? JSON.parse(readFileSync(progress,'utf8')).removed : [];
    for (const member of members) {
      if (!removed.includes(member.id) || lstatSync(member.workspace,{throwIfNoEntry:false}) || registered(member.source,member.workspace) || realpathSync(git(member.source,'rev-parse','--path-format=absolute','--git-common-dir').trim()) !== member.commonDir) throw new Error('Dependency removal is unresolved');
    }
    writeIntent({...intent,status:'removed'});
    writeFileSync(cleanupPath+'.tmp',JSON.stringify({cleanupStatus:'removed',removedAt:new Date().toISOString()}),{mode:0o600});renameSync(cleanupPath+'.tmp',cleanupPath);
    const recovered={...record,timelineSequence:readTimeline(join(root,'runs',id)).events.length};observe(root,recovered,'cleanup.completed',{status:'removed',reconciled:true});
    return {...record,cleanupStatus:'removed'};
  }
  if (intent && (intent.status !== 'removing' || intent.device !== stat.dev || intent.inode !== stat.ino)) throw new Error('Cleanup workspace was replaced');
  if (realpathSync(record.workspace) !== record.workspace) throw new Error('Workspace path is redirected');
  const common = realpathSync(git(record.workspace,'rev-parse','--path-format=absolute','--git-common-dir').trim());
  if (common !== record.commonDir || !git(record.source,'worktree','list','--porcelain','-z').split('\0').includes(`worktree ${record.workspace}`)) throw new Error('Workspace registration mismatch');
  // Use the immutable base configuration rather than potentially edited record settings.
  const env = environment(new ConfigurationReader().definition(record.workspace,record.base,'architecture/environment').value);
  const definitions=env.workspace?.dependencies??[];
  if(definitions.length!==members.length)throw new Error('Dependency ownership record mismatch');
  for(const [i,definition] of definitions.entries()){
    const m=members[i]!;
    if(m.id!==definition.id||m.base!==definition.commit||m.workspace!==join(record.workspace,definition.path))throw new Error('Dependency ownership record mismatch');
    m.definition=definition;
  }
  assertOutputs(record.workspace,env);
  cleanupMembers(root,record,true);
  if (!intent) writeIntent({...identity,device:stat.dev,inode:stat.ino,status:'removing'});
  const cleanupRecord={...record,timelineSequence:readTimeline(join(root,'runs',id)).events.length};observe(root,cleanupRecord,'cleanup.started',{});cleanupMembers(root,record);
  git(record.source,'worktree','remove',record.workspace);
  writeIntent({...identity,device:stat.dev,inode:stat.ino,status:'removed'});
  writeFileSync(`${cleanupPath}.tmp`, JSON.stringify({ cleanupStatus: 'removed', removedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${cleanupPath}.tmp`, cleanupPath);observe(root,cleanupRecord,'cleanup.completed',{status:'removed'});
  return { ...record, cleanupStatus: 'removed' };
}
