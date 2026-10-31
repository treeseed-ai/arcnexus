import { readFileSync, realpathSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execute, type CommandResult } from './process.js';
import { targetCommand, targetEnvironment } from './bindings.js';
import { observe } from './timeline.js';
import { save, type RecordData } from './state.js';
import type { Command } from './config.js';
import { digest, type ResolvedAssignment } from './assignment.js';
import type { BridgeTool } from './bridge.js';
export interface Operation extends Command {schemaVersion:2;id:string;purpose:string;kind:'command';repository:string;cwd:string;category:string;activities:string[];timeoutSeconds:number;generatedDirectories:string[];artifacts:string[];probes:Command[]}
export interface OperationBridge {tools:BridgeTool[];call:(name:string,args:unknown)=>Promise<unknown>;disconnect:()=>void}
export function operationEnvironment(record:RecordData):NodeJS.ProcessEnv {
 const target=targetEnvironment(record),env:NodeJS.ProcessEnv={};for(const key of ['PATH','LANG','LC_ALL','TZ','TMPDIR','SSL_CERT_FILE','SSL_CERT_DIR'])if(target[key])env[key]=target[key];return env;
}
export function operationBridge(root:string,record:RecordData,signal:AbortSignal,inspect:()=>void):OperationBridge {
 const resolved=record.resolvedAssignment as ResolvedAssignment;record.operations??=[];record.operationCalls??=0;let active:AbortController|undefined;
 const tools:BridgeTool[]=[{name:'operations.list',description:'List captured engineering operations and their fixed commands.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'operations.run',description:'Execute one declared operation by ID and receive actual output. Nonzero tests are evidence, not transport failures.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}];
 return {tools,disconnect:()=>active?.abort(new Error('Operation bridge disconnected')),call:async(name,args)=>{
  if(name==='operations.list'){if(args&&Object.keys(args).length)throw new Error('Operation listing accepts no arguments');return {operations:resolved.operations,budget:resolved.executionProfile.maxOperationCalls??24,used:record.operationCalls};}
  record.operationCalls=Number(record.operationCalls)+1;observe(root,record,'operation.requested',{number:record.operationCalls,args});save(root,record);
  if(Number(record.operationCalls)>(resolved.executionProfile.maxOperationCalls??24))throw new Error('Operation request budget exhausted');
  if(!args||typeof args!=='object'||Object.keys(args).length!==1||typeof(args as {id?:unknown}).id!=='string')throw new Error('Operation requires only an ID');
  const id=(args as {id:string}).id,op=resolved.operations.find(op=>op.id===id);
  if(!op)throw new Error('Unknown or denied operation: '+id);
  const stage=String(record.stage),activities=stage==='specification'?['research','documentation','testing']:stage==='correction'?['implementation']:stage==='planning'?['research']:[stage];
  if(!op.activities.some(a=>activities.includes(a)))throw new Error('Operation activity denied: '+stage);
  if(active)throw new Error('Concurrent operation denied');
  const cwd=realpathSync(join(record.workspace,op.cwd)),path=relative(record.workspace,cwd);if(path.startsWith('..')||path.startsWith('/'))throw new Error('Operation working directory escapes workspace');
  active=new AbortController();const combined=AbortSignal.any([signal,active.signal]),start=Date.now();record.currentOperation=id;observe(root,record,'operation.started',{id,number:record.operationCalls,cwd});save(root,record);
  let result:CommandResult|undefined;
  try{
   const c=targetCommand(record,{command:op.command,args:op.args.map(a=>a==='{workspace}'?record.workspace:a)});
   try{result=await execute(c,cwd,join(root,'runs',record.id,`operation-${record.operationCalls}.log`),combined,{env:operationEnvironment(record),timeoutMs:Math.min(op.timeoutSeconds,resolved.executionProfile.commandTimeoutSeconds)*1000});}
   catch(error){if(error&&typeof error==='object'&&'commandResult'in error)result=error.commandResult as CommandResult;if(!(error instanceof Error)||!error.message.startsWith('Command failed ('))throw error;}
   inspect();const artifacts=op.artifacts.map(path=>{const source=join(record.workspace,path);if(!lstatSync(source).isFile()||realpathSync(source)!==source)throw new Error('Operation artifact must be a regular non-symlink file');const bytes=readFileSync(source);if(bytes.length>64*1024*1024)throw new Error('Operation artifact limit exceeded');const dir=join(root,'runs',record.id,'operation-artifacts',String(record.operationCalls));mkdirSync(dir,{recursive:true,mode:0o700});const sha256=digest(bytes);writeFileSync(join(dir,sha256),bytes,{mode:0o600});return {path,sha256,artifact:relative(join(root,'runs',record.id),join(dir,sha256))};});const output=readFileSync(result!.log).subarray(0,16384).toString('utf8');return {id,status:result!.exitCode===0?'passed':'failed',...result,output,artifacts};
  }finally{
   if(result)(record.operations as unknown[]).push({id,...result});observe(root,record,'operation.finished',{id,durationMs:Date.now()-start,result});delete record.currentOperation;active=undefined;save(root,record);inspect();
  }
 }};
}
