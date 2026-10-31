import type { ResolvedAssignment } from './assignment.js';
import { Codex } from '@openai/codex-sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execute } from './process.js';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { RecordData } from './state.js';
import { save } from './state.js';
import { persistExecutionEvidence } from './evidence.js';
import { preparePermissions } from './permissions.js';
export interface AgentResult {status:'completed'|'blocked'|'failed';summary:string;blockers:string[]}
const schema={type:'object',properties:{status:{type:'string',enum:['completed','blocked','failed']},summary:{type:'string'},blockers:{type:'array',items:{type:'string'}}},required:['status','summary','blockers'],additionalProperties:false};
export async function runCodex(root:string,record:RecordData,prompt:string,executable:string,model:string,signal:AbortSignal,resumeId?:string):Promise<AgentResult>{
  const dir=join(root,'runs',record.id), launcher=join(dir,'codex-launcher'),pidFile=join(dir,'codex.pid');
  const context=record.context as Array<{access?:unknown;allowedWritePaths?:unknown}>|undefined;
  const resolved=record.resolvedAssignment as ResolvedAssignment|undefined;
  const component=context?.at(-1);
  const profile=resolved?.executionProfile;
  const allowedWritePaths=resolved?.allowedWritePaths??component?.allowedWritePaths;
  const inherited=context?.slice(0,-1).map(item=>({access:item.access,allowedWritePaths:item.allowedWritePaths}))??[];
  const permissions=preparePermissions(record.workspace,component?.access,allowedWritePaths,join(dir,'tmp'),inherited);
  writeFileSync(launcher,'#!/bin/sh\n[ "$1" = exec ] || exit 64\nshift\necho $$ > "$ARCNEXUS_CODEX_PID"\nexec setsid "$ARCNEXUS_CODEX_EXECUTABLE" exec --ignore-user-config "$@"\n',{mode:0o700});
  const env:Record<string,string>={};
  for(const name of ['HOME','PATH','CODEX_HOME','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','XDG_CONFIG_HOME','XDG_DATA_HOME'])if(process.env[name])env[name]=process.env[name]!;
  env.ARCNEXUS_CODEX_EXECUTABLE=executable.includes('/')?resolve(executable):executable;env.ARCNEXUS_CODEX_PID=pidFile;
  env.TMPDIR=permissions.tmpDirectory;
  const settings={model,reasoning:profile?.reasoning??'medium',permissionProfile:'arcnexus',access:component?.access,allowedWritePaths,filesystem:permissions.filesystem,approval:'never',network:false,webSearch:profile?.webSearch??'live',nestedDelegation:false,executable:env.ARCNEXUS_CODEX_EXECUTABLE};
  persistExecutionEvidence(root,record,prompt,env.ARCNEXUS_CODEX_EXECUTABLE,settings,schema,env);
  const preflightHome=join(dir,`sandbox-preflight-home-${(record.attempts as unknown[]).length}`);mkdirSync(preflightHome,{recursive:true,mode:0o700});
  const preflightEnv={...env,CODEX_HOME:preflightHome};
  const preflightArgs=['sandbox','--permission-profile','arcnexus','--cd',record.workspace];
  for(const override of permissions.configOverrides)preflightArgs.push('--config',override);
  preflightArgs.push('--','true');
  record.settings=settings;record.attemptReportedUsage=undefined;save(root,record);
  try {
    const probe=await execute({command:env.ARCNEXUS_CODEX_EXECUTABLE,args:preflightArgs},record.workspace,join(dir,`sandbox-preflight-${(record.attempts as unknown[]).length}.log`),signal,{env:preflightEnv,timeoutMs:5000});
    record.sandboxPreflight={...probe,status:'passed'};
  } catch(error) {
    record.sandboxPreflight={status:'failed',error:String(error),...(error&&typeof error==='object'&&'commandResult'in error?error.commandResult as object:{})};
    throw new Error(`Codex permission sandbox preflight failed: ${String(error)}`);
  } finally {
    writeFileSync(join(dir,'sandbox-preflight.json'),JSON.stringify(record.sandboxPreflight,null,2)+'\n',{mode:0o600});save(root,record);
  }
  const codex=new Codex({codexPathOverride:launcher,env,config:{features:{multi_agent:false,multi_agent_v2:false}},configOverrides:permissions.configOverrides});
  const options={model,modelReasoningEffort:profile?.reasoning??'medium' as const,workingDirectory:record.workspace,approvalPolicy:'never' as const,webSearchMode:profile?.webSearch??'live' as const};
  const thread=resumeId?codex.resumeThread(resumeId,options):codex.startThread(options);
  let final='',completed=false;
  const killGroup=()=>{if(existsSync(pidFile)){const pid=Number(readFileSync(pidFile,'utf8').trim());if(Number.isSafeInteger(pid)&&pid>1)try{process.kill(-pid,'SIGKILL');}catch{}}};
  let termination:Promise<void>|undefined;
  const abort=()=>{termination=delay(300).then(killGroup);};signal.addEventListener('abort',abort,{once:true});
  try {
    signal.throwIfAborted();
    const {events}=await thread.runStreamed(prompt,{outputSchema:schema,signal});
    for await(const event of events){
      appendFileSync(join(dir,'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
      if(event.type==='thread.started'){if(resumeId&&event.thread_id!==resumeId)throw new Error('Codex resumed an unexpected thread ID');record.threadId=event.thread_id;save(root,record);}
      if(event.type==='item.completed'&&event.item.type==='agent_message')final=event.item.text;
      if(event.type==='turn.completed'){record.attemptReportedUsage=event.usage;completed=true;}
      if(event.type==='turn.failed')throw new Error(event.error.message);
      if(event.type==='error')throw new Error(event.message);
    }
    signal.throwIfAborted();
    if(!completed)throw new Error('Codex stream ended without completed turn');
    writeFileSync(join(dir,'agent-result.raw.txt'),final,{mode:0o600});
    const result=JSON.parse(final) as AgentResult;
    if(!result||!['completed','blocked','failed'].includes(result.status)||typeof result.summary!=='string'||!Array.isArray(result.blockers)||!result.blockers.every(b=>typeof b==='string'))throw new Error('Malformed agent result');
    writeFileSync(join(dir,'agent-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
    return result;
  } finally {signal.removeEventListener('abort',abort);await termination;killGroup();save(root,record);}
}
