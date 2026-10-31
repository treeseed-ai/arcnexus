#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { InputError } from './config.js';
import { stateRoot, lock, save, type RecordData } from './state.js';
import { createWorkspace, prepareWorkspace, cleanup } from './workspace.js';
const help = 'ArcNexus\n  prepare --project <repository> [--base <ref>] [--issue <number>] [--timeout-seconds <seconds>]\n  cleanup <workspace-id>\n';
async function main(): Promise<void> {
  let record: RecordData | undefined, root: string | undefined, unlock: (()=>void) | undefined;
  let timer: NodeJS.Timeout | undefined;
  const controller = new AbortController(); let cancelled=false;
  const cancel=()=>{cancelled=true;controller.abort(new Error('Cancelled'));};
  process.on('SIGINT',cancel); process.on('SIGTERM',cancel);
  try {
    let parsed;
    try { parsed=parseArgs({allowPositionals:true,options:{project:{type:'string'},base:{type:'string'},issue:{type:'string'},'timeout-seconds':{type:'string'},help:{type:'boolean'},version:{type:'boolean'}}}); }
    catch(error) {throw new InputError(String(error));}
    const {values,positionals}=parsed;
    if(values.help){console.log(help);return;} if(values.version){console.log('0.1.0');return;}
    const command=positionals[0];
    if(command!=='prepare' && command!=='cleanup')throw new InputError(help);
    if(command==='prepare' && (!values.project || positionals.length!==1))throw new InputError('prepare requires --project');
    if(command==='cleanup' && positionals.length!==2)throw new InputError('cleanup requires workspace ID');
    if(values.issue && !/^[1-9]\d*$/.test(values.issue))throw new InputError('Invalid issue number');
    const seconds=Number(values['timeout-seconds']??900);
    if(!Number.isFinite(seconds)||seconds<=0)throw new InputError('Invalid timeout');
    root=stateRoot(); unlock=lock(root);
    timer=setTimeout(()=>controller.abort(new Error('Operation timed out')),seconds*1000);
    if(command==='cleanup')record=cleanup(root,positionals[1]!);
    else { record=createWorkspace(root,{project:values.project!,base:values.base,issue:values.issue}); await prepareWorkspace(root,record,controller.signal); }
  } catch(error) {
    if(record){record.status=cancelled?'cancelled':'failed';record.error=String(error);}
    process.exitCode=cancelled?130:error instanceof InputError?2:1; console.error(String(error));
  } finally {
    if(timer)clearTimeout(timer);
    if(record&&root){record.finishedAt=new Date().toISOString();save(root,record);console.log(JSON.stringify(record));}
    unlock?.(); process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
  }
}
await main();
