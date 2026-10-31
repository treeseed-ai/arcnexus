import { join, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openBridge } from './bridge.js';
import { execute } from './process.js';
import { targetCommand } from './bindings.js';
import { operationEnvironment } from './operations.js';
import { assertIdentity, assertOutputs } from './workspace.js';
import { observe } from './timeline.js';
import { save, type RecordData } from './state.js';
import type { ResolvedAssignment } from './assignment.js';
export async function prepareCapabilities(root:string,record:RecordData,signal:AbortSignal):Promise<void>{
 const resolved=record.resolvedAssignment as ResolvedAssignment;if(resolved.executionProfile.schemaVersion!==2)return;
 const probes:unknown[]=[];record.probes=probes;record.stage='capability-probes';const seen=new Set<string>();
 for(const op of resolved.operations)for(const probe of op.probes){
  const key=JSON.stringify([op.cwd,probe]);if(seen.has(key))continue;seen.add(key);signal.throwIfAborted();
  const cwd=realpathSync(join(record.workspace,op.cwd));if(relative(record.workspace,cwd).startsWith('..'))throw new Error('Probe working directory escapes workspace');
  observe(root,record,'probe.started',{operationId:op.id,command:probe,cwd});
  try{const result=await execute(targetCommand(record,probe),cwd,join(root,'runs',record.id,`probe-${probes.length}.log`),signal,{env:operationEnvironment(record),timeoutMs:resolved.executionProfile.commandTimeoutSeconds*1000});probes.push({operationId:op.id,route:'host',...result});observe(root,record,'probe.completed',result);}
  catch(error){const result=error&&typeof error==='object'&&'commandResult'in error?error.commandResult:undefined;probes.push({operationId:op.id,route:'host',result,error:String(error)});observe(root,record,'probe.failed',probes.at(-1));throw error;}
  finally{save(root,record);assertIdentity(record);assertOutputs(record.workspace,record.environment);}
 }
 const start=Date.now(),bridge=await openBridge([{name:'probe',description:'Connectivity probe',inputSchema:{type:'object'}}],async()=>({ok:true}));
 const client=new Client({name:'arcnexus-capability-probe',version:'1'},{capabilities:{}});
 const config=(bridge.config.mcp_servers as {arcnexus:{command:string;args:string[]}}).arcnexus;
 const abort=()=>{void client.close();};signal.addEventListener('abort',abort,{once:true});
 try{signal.throwIfAborted();await client.connect(new StdioClientTransport({command:config.command,args:config.args}),{timeout:5000});const result=await client.callTool({name:'probe',arguments:{}},undefined,{timeout:5000});signal.throwIfAborted();if(result.isError)throw new Error('Bridge functional probe failed');const evidence={route:'stdio-mcp',status:'passed',durationMs:Date.now()-start,transport:'ArcNexus bridge',runtime:process.version};probes.push(evidence);observe(root,record,'probe.completed',evidence);}
 finally{signal.removeEventListener('abort',abort);await client.close();await bridge.close();save(root,record);}
}
