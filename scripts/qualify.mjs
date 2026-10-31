import {readFileSync,writeFileSync,mkdirSync,renameSync,readdirSync,lstatSync,openSync,closeSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateSchema} from '../dist/schema.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const controller=new AbortController();
const cancel=()=>controller.abort(new Error('Campaign cancelled'));
process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
function runnerHash(runner){
 const entries=[];
 function visit(path){for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile())entries.push([file,hash(readFileSync(file))]);else throw new Error('Runner files must not be symlinks');}}
 visit(dirname(runner));visit(join(dirname(runner),'../schemas'));
 entries.push(['lock',hash(readFileSync(join(dirname(runner),'../package-lock.json')))]);
 return hash(JSON.stringify(entries));
}
function snapshot(file,directory,records){
 if(!isAbsolute(file)||!lstatSync(file).isFile())throw new Error(`Expected absolute regular file: ${file}`);
 const bytes=readFileSync(file),destination=join(directory,'files',file.slice(1));
 mkdirSync(dirname(destination),{recursive:true,mode:0o700});if(existsSync(destination)){if(hash(readFileSync(destination))!==hash(bytes))throw new Error('Conflicting artifact snapshots');}else writeFileSync(destination,bytes,{mode:0o500});
 records.push({path:file,snapshot:destination,sha256:hash(bytes)});return destination;
}
function captureCommand(command,directory,records){
 if(!isAbsolute(command.command))throw new Error('Acceptance executable must be absolute');
 const paths=new Map(command.artifacts.map(file=>[file,snapshot(file,directory,records)]));
 return {...command,command:paths.get(command.command)??command.command,args:command.args.map(a=>paths.get(a)??a),artifacts:[...paths.values()]};
}
async function execute(command,args,prefix,timeoutMs){
 controller.signal.throwIfAborted();
 const start=Date.now(),stdout=prefix+'.stdout',stderr=prefix+'.stderr',out=openSync(stdout,'wx',0o600),err=openSync(stderr,'wx',0o600);
 return await new Promise(resolveResult=>{
  const child=spawn(command,args,{stdio:['ignore',out,err]});let failure,killTimer;
  const stop=()=>{child.kill('SIGINT');killTimer??=setTimeout(()=>child.kill('SIGKILL'),2000);};
  controller.signal.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(()=>{failure='Campaign command timed out';stop();},timeoutMs);
  child.on('error',error=>{failure=String(error);});
  child.on('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(killTimer);controller.signal.removeEventListener('abort',stop);closeSync(out);closeSync(err);resolveResult({command,args,exitCode,signal,error:failure,durationMs:Date.now()-start,stdout,stderr});});
  if(controller.signal.aborted)stop();
 });
}
let campaign,output;
function save(){const path=join(output,'campaign.json');writeFileSync(path+'.tmp',JSON.stringify(campaign,null,2)+'\n',{mode:0o600});renameSync(path+'.tmp',path);}
try{
 if(process.argv.length!==4)throw new Error('Usage: node scripts/qualify.mjs <manifest.json> <new-output-directory>');
 const manifest=validateSchema('campaign',read(process.argv[2]));
 if(!isAbsolute(manifest.runner)||!isAbsolute(manifest.codexPath??process.execPath))throw new Error('Runner and Codex executable must be absolute');
 manifest.runner=realpathSync(manifest.runner);output=resolve(process.argv[3]);
 const ids=new Set();
 for(const c of manifest.cases){if(ids.has(c.id))throw new Error('Duplicate case identity');ids.add(c.id);if(!isAbsolute(c.project)||output===c.project||output.startsWith(c.project+'/'))throw new Error('Campaign evidence must be outside target repositories');}
 mkdirSync(output,{mode:0o700});
 campaign={schemaVersion:1,status:'preparing',startedAt:new Date().toISOString(),manifest,manifestHash:hash(readFileSync(process.argv[2])),runnerHash:runnerHash(manifest.runner),node:process.version,cases:[],snapshots:[]};save();
 const prepared=manifest.cases.map(c=>{
  const directory=join(output,c.id);mkdirSync(directory,{mode:0o700});
  const assignment=validateSchema('assignment',read(c.assignment));
  campaign.snapshots.push({path:c.assignment,sha256:hash(readFileSync(c.assignment))});
  assignment.hostChecks=assignment.hostChecks.map(check=>captureCommand(check,directory,campaign.snapshots));
  const assignmentFile=join(directory,'assignment.json');writeFileSync(assignmentFile,JSON.stringify(assignment),{mode:0o400});
  const bindings=c.bindings?snapshot(c.bindings,directory,campaign.snapshots):undefined;
  return {...c,directory,assignment:assignmentFile,bindings,acceptance:c.acceptance.map(check=>captureCommand(check,directory,campaign.snapshots))};
 });
 campaign.status='running';save();
 for(const c of prepared){
  if(controller.signal.aborted)break;
  const entry={id:c.id,status:'running',base:c.base,faultInjection:c.faultInjection,acceptance:[]};campaign.cases.push(entry);save();
  try{
   const args=[manifest.runner,'run',c.component,'--project',c.project,'--base',c.base,'--assignment',c.assignment,'--model','gpt-6-luna','--max-attempts',String(c.maxAttempts??1)];
   for(const [name,value] of [['bindings',c.bindings],['issue',c.issue],['codex-path',manifest.codexPath]])if(value)args.push('--'+name,value);
   entry.execution=await execute(process.execPath,args,join(c.directory,'execution'),920000);
   entry.report=read(entry.execution.stdout);entry.reportPath=join(c.directory,'report.json');writeFileSync(entry.reportPath,JSON.stringify(entry.report,null,2),{mode:0o600});
   if(entry.report.settings?.model!=='gpt-6-luna'||entry.report.settings?.reasoning!=='medium')throw new Error('Qualification requires Luna at medium reasoning');
   entry.usage=entry.report.usage;entry.interventionCount=(entry.report.callerInterventions??[]).length;
   if(entry.execution.exitCode!==(c.expectedOutcome==='blocked'?1:0)||entry.report.outcome!==c.expectedOutcome)throw new Error('Unexpected execution outcome');
   for(const [index,check] of c.acceptance.entries()){
    const result=await execute(check.command,check.args.map(a=>a.replaceAll('{report}',entry.reportPath)),join(c.directory,`acceptance-${index}`),120000);entry.acceptance.push(result);
    if(result.exitCode!==0)throw new Error('Independent campaign acceptance failed');
   }
   entry.status='passed';
  }catch(error){entry.status=controller.signal.aborted?'cancelled':'failed';entry.error=String(error);}
  save();console.error(`${c.id}: ${entry.status}`);
 }
 campaign.finalRunnerHash=runnerHash(manifest.runner);
 campaign.status=controller.signal.aborted?'cancelled':campaign.cases.length===prepared.length&&campaign.cases.every(c=>c.status==='passed')&&campaign.runnerHash===campaign.finalRunnerHash?'passed':'failed';
 campaign.finishedAt=new Date().toISOString();save();process.exitCode=controller.signal.aborted?130:campaign.status==='passed'?0:1;console.log(JSON.stringify({status:campaign.status,report:join(output,'campaign.json')}));
}catch(error){console.error(String(error));if(campaign){campaign.error=String(error);campaign.status=controller.signal.aborted?'cancelled':'failed';save();}process.exitCode=controller.signal.aborted?130:2;}
finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
