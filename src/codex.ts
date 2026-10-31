import { openBridge } from './bridge.js';
import { acceptPlan, updatePlan } from './plan.js';
import { observe } from './timeline.js';
import type { Plan, PlanUpdate } from './plan.js';
import { targetEnvironment, toolDirectories } from './bindings.js';
import type { Member } from './members.js';
import { validateSchema } from './schema.js';
import type { ResolvedAssignment } from './assignment.js';
import { Codex } from '@openai/codex-sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execute } from './process.js';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { RecordData } from './state.js';
import { save } from './state.js';
import { persistExecutionEvidence } from './evidence.js';
import { preparePermissions, type AccessPolicy } from './permissions.js';
export interface AgentResult {
 plan?:Plan|null;planUpdates?:PlanUpdate[];
 status:'completed'|'blocked'|'failed'; summary:string; blockers:string[];
 findings:Array<{summary:string;evidence:string[];uncertainty:string}>;
 activities:Array<{activity:string;status:string;summary:string;sources:string[]}>;
 regression:{verificationIndex:number;exitCode:number;outputIncludes:string}|null;
 reviewFindings:string[];
 requests:Array<{fromComponent:string;ownerId:string|null;request:string;evidence:string[];acceptanceCriteria:string[];reason:string}>;
}
const baseSchema=JSON.parse(readFileSync(new URL('../schemas/agent-result.json',import.meta.url),'utf8'));
export async function runCodex(root:string,record:RecordData,prompt:string,executable:string,model:string,signal:AbortSignal,resumeId?:string):Promise<AgentResult>{
  const dir=join(root,'runs',record.id), launcher=join(dir,'codex-launcher'),pidFile=join(dir,'codex.pid');
  appendFileSync(join(dir,'events.jsonl'),'',{mode:0o600});
  const context=record.context as Array<{access?:unknown;allowedWritePaths?:unknown}>|undefined;
  const resolved=record.resolvedAssignment as ResolvedAssignment|undefined;
  const component=context?.at(-1);
  const profile=resolved?.executionProfile;
  const schema=structuredClone(baseSchema);if(profile?.schemaVersion===2){schema.required=Object.keys(schema.properties);}else{delete schema.properties.plan;delete schema.properties.planUpdates;}
  const readOnly=record.readOnlyTurn===true;
  const allowedWritePaths=readOnly?[]:resolved?.allowedWritePaths??component?.allowedWritePaths;
  const declared=component?.access as AccessPolicy;
  const access=readOnly?{readPaths:[...new Set([...declared.readPaths,...declared.writeDirectories])],writeDirectories:[]}:declared;
  const inherited=context?.slice(0,-1).map(item=>({access:item.access,allowedWritePaths:item.allowedWritePaths}))??[];
  const permissions=preparePermissions(record.workspace,access,allowedWritePaths,join(dir,'tmp'),inherited,((record.members??[]) as Member[]).map(m=>m.workspace),toolDirectories(record));
  writeFileSync(launcher,'#!/bin/sh\n[ "$1" = exec ] || exit 64\nshift\necho $$ > "$ARCNEXUS_CODEX_PID"\nexec setsid "$ARCNEXUS_CODEX_EXECUTABLE" exec --ignore-user-config "$@"\n',{mode:0o700});
  const env:Record<string,string>={};
  for(const name of ['HOME','PATH','CODEX_HOME','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','XDG_CONFIG_HOME','XDG_DATA_HOME'])if(process.env[name])env[name]=process.env[name]!;
  env.ARCNEXUS_CODEX_EXECUTABLE=executable.includes('/')?resolve(executable):executable;env.ARCNEXUS_CODEX_PID=pidFile;
  env.TMPDIR=permissions.tmpDirectory;env.PATH=targetEnvironment(record).PATH!;
  const settings={model,reasoning:profile?.reasoning??'medium',permissionProfile:'arcnexus',access,allowedWritePaths,filesystem:permissions.filesystem,approval:'never',network:false,webSearch:profile?.webSearch??'live',nestedDelegation:false,executable:env.ARCNEXUS_CODEX_EXECUTABLE};
  persistExecutionEvidence(root,record,prompt,env.ARCNEXUS_CODEX_EXECUTABLE,settings,schema,env);
  const preflightHome=join(dir,`sandbox-preflight-home-${(record.turns as unknown[]).length}`);mkdirSync(preflightHome,{recursive:true,mode:0o700});
  const preflightEnv={...env,CODEX_HOME:preflightHome};
  const preflightArgs=['sandbox','--permission-profile','arcnexus','--cd',record.workspace];
  for(const override of permissions.configOverrides)preflightArgs.push('--config',override);
  preflightArgs.push('--','true');
  record.settings=settings;record.attemptReportedUsage=undefined;save(root,record);
  try {
    const probe=await execute({command:env.ARCNEXUS_CODEX_EXECUTABLE,args:preflightArgs},record.workspace,join(dir,`sandbox-preflight-${(record.turns as unknown[]).length}.log`),signal,{env:preflightEnv,timeoutMs:5000});
    record.sandboxPreflight={...probe,status:'passed'};
  } catch(error) {
    record.sandboxPreflight={status:'failed',error:String(error),...(error&&typeof error==='object'&&'commandResult'in error?error.commandResult as object:{})};
    throw new Error(`Codex permission sandbox preflight failed: ${String(error)}`);
  } finally {
    writeFileSync(join(dir,'sandbox-preflight.json'),JSON.stringify(record.sandboxPreflight,null,2)+'\n',{mode:0o600});save(root,record);
  }
  let bridgeError:unknown;
  const bridge=profile?.schemaVersion===2?await openBridge([{name:'plan.update',description:'Record checklist progress with evidence. Completion is an agent claim.',inputSchema:{type:'object',properties:{updates:{type:'array',items:{type:'object'}},revision:{type:'object'},reason:{type:'string'}},additionalProperties:false}}],async(name,args)=>{try{if(record.stage==='planning')throw new Error('Plan updates require an accepted plan');if(!args||typeof args!=='object'||Object.keys(args).some(k=>!['updates','revision','reason'].includes(k)))throw new Error('Invalid plan update arguments');const input=args as {updates?:unknown;revision?:unknown;reason?:string};if(input.revision){if(input.updates||typeof input.reason!=='string'||!input.reason.trim())throw new Error('Plan revision requires reason and excludes progress updates');acceptPlan(root,record,input.revision,input.reason);}else updatePlan(root,record,input.updates);return {status:'recorded',plan:record.plan};}catch(error){bridgeError=error;throw error;}}):undefined;
  const codex=new Codex({codexPathOverride:launcher,env,config:{...bridge?.config as object,features:{multi_agent:false,multi_agent_v2:false}},configOverrides:permissions.configOverrides});
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
      observe(root,record,'codex.event',event);
      appendFileSync(join(dir,'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
      if(event.type==='thread.started'){if(resumeId&&event.thread_id!==resumeId)throw new Error('Codex resumed an unexpected thread ID');record.threadId=event.thread_id;save(root,record);}
      if(event.type==='item.completed'&&event.item.type==='agent_message')final=event.item.text;
      if(event.type==='turn.completed'){record.attemptReportedUsage=event.usage;completed=true;}
      if(event.type==='turn.failed')throw new Error(event.error.message);
      if(event.type==='error')throw new Error(event.message);
    }
    signal.throwIfAborted();
    if(bridgeError)throw bridgeError;
    if(!completed)throw new Error('Codex stream ended without completed turn');
    writeFileSync(join(dir,'agent-result.raw.txt'),final,{mode:0o600});
    const result=validateSchema<AgentResult>('agent-result',JSON.parse(final));
    if(profile?.schemaVersion===2&&(!Object.hasOwn(result,'plan')||!Array.isArray(result.planUpdates)))throw new Error('Planned response requires plan and planUpdates');
    writeFileSync(join(dir,'agent-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
    return result;
  } finally {await bridge?.close();signal.removeEventListener('abort',abort);await termination;killGroup();save(root,record);}
}
