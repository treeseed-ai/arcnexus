import { Codex } from '@openai/codex-sdk';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { RecordData } from './state.js';
import { save } from './state.js';
import { persistExecutionEvidence } from './evidence.js';
export interface AgentResult {status:'completed'|'blocked'|'failed';summary:string;blockers:string[]}
const schema={type:'object',properties:{status:{type:'string',enum:['completed','blocked','failed']},summary:{type:'string'},blockers:{type:'array',items:{type:'string'}}},required:['status','summary','blockers'],additionalProperties:false};
export async function runCodex(root:string,record:RecordData,prompt:string,executable:string,model:string,signal:AbortSignal):Promise<AgentResult>{
  const dir=join(root,'runs',record.id), launcher=join(dir,'codex-launcher'),pidFile=join(dir,'codex.pid');
  writeFileSync(launcher,'#!/bin/sh\n[ "$1" = exec ] || exit 64\nshift\necho $$ > "$ARCNEXUS_CODEX_PID"\nexec setsid "$ARCNEXUS_CODEX_EXECUTABLE" exec --ignore-user-config "$@"\n',{mode:0o700});
  const env:Record<string,string>={};
  for(const name of ['HOME','PATH','CODEX_HOME','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','XDG_CONFIG_HOME','XDG_DATA_HOME'])if(process.env[name])env[name]=process.env[name]!;
  env.ARCNEXUS_CODEX_EXECUTABLE=executable.includes('/')?resolve(executable):executable;env.ARCNEXUS_CODEX_PID=pidFile;
  const settings={model,reasoning:'medium',sandbox:'workspace-write',approval:'never',network:false,webSearch:'live',nestedDelegation:false,executable:env.ARCNEXUS_CODEX_EXECUTABLE};
  persistExecutionEvidence(root,record,prompt,env.ARCNEXUS_CODEX_EXECUTABLE,settings,schema,env);
  const codex=new Codex({codexPathOverride:launcher,env,config:{features:{multi_agent:false,multi_agent_v2:false}}});
  const thread=codex.startThread({model,modelReasoningEffort:'medium',workingDirectory:record.workspace,sandboxMode:'workspace-write',approvalPolicy:'never',networkAccessEnabled:false,webSearchMode:'live'});
  record.settings=settings;record.usage=null;save(root,record);
  let final='',completed=false;
  const killGroup=()=>{if(existsSync(pidFile)){const pid=Number(readFileSync(pidFile,'utf8').trim());if(Number.isSafeInteger(pid)&&pid>1)try{process.kill(-pid,'SIGKILL');}catch{}}};
  let termination:Promise<void>|undefined;
  const abort=()=>{termination=delay(300).then(killGroup);};signal.addEventListener('abort',abort,{once:true});
  try {
    signal.throwIfAborted();
    const {events}=await thread.runStreamed(prompt,{outputSchema:schema,signal});
    for await(const event of events){
      appendFileSync(join(dir,'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
      if(event.type==='thread.started'){record.threadId=event.thread_id;save(root,record);}
      if(event.type==='item.completed'&&event.item.type==='agent_message')final=event.item.text;
      if(event.type==='turn.completed'){record.usage=event.usage;completed=true;}
      if(event.type==='turn.failed')throw new Error(event.error.message);
      if(event.type==='error')throw new Error(event.message);
    }
    signal.throwIfAborted();
    if(!completed)throw new Error('Codex stream ended without completed turn');
    const result=JSON.parse(final) as AgentResult;
    if(!result||!['completed','blocked','failed'].includes(result.status)||typeof result.summary!=='string'||!Array.isArray(result.blockers)||!result.blockers.every(b=>typeof b==='string'))throw new Error('Malformed agent result');
    return result;
  } finally {signal.removeEventListener('abort',abort);await termination;killGroup();save(root,record);}
}
