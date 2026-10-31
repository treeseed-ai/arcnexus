import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {catalogFixture,componentFields} from "./catalog-fixture.mjs";
export const cli=resolve('dist/cli.js');
export function workflowFixture(t,mode='success'){
 const root=mkdtempSync(join(tmpdir(),'arcnexus-workflow-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo'),state=join(root,'state'),calls=join(root,'calls.jsonl');mkdirSync(join(repo,'architecture/components'),{recursive:true});
 const git=(...args)=>{const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');catalogFixture(repo);
 mkdirSync(join(repo,'docs'));mkdirSync(join(repo,'tests'));writeFileSync(join(repo,'docs/behavior.md'),'Before');writeFileSync(join(repo,'tests/.keep'),'');
 writeFileSync(join(repo,'source.txt'),'before');writeFileSync(join(repo,'.gitignore'),'.env\ngenerated/\n');
 writeFileSync(join(repo,'verify.cjs'),"const fs=require('fs');if(fs.existsSync('tests/regression.cjs'))require('./tests/regression.cjs');if(fs.readFileSync('source.txt','utf8')==='broken')process.exit(6);");
 const component={...componentFields,id:'sample',type:'library',purpose:'Own sample behavior',path:'source.txt',objectives:['Bounded change'],constraints:['No commits'],documentation:['docs'],tests:['tests'],access:{readPaths:['.'],writeDirectories:['.']},allowedWritePaths:['source.txt','docs','tests','new.txt'],verification:[{command:'node',args:['verify.cjs']}]};
 writeFileSync(join(repo,'architecture/components/sample.json'),JSON.stringify(component));
 writeFileSync(join(repo,'architecture/components/dependency.json'),JSON.stringify({...component,id:'dependency',purpose:'Own dependency interface'}));
 writeFileSync(join(repo,'architecture/environment.yaml'),JSON.stringify({schemaVersion:1,prerequisites:[],setup:[],generatedDirectories:['generated']}));
 const executable=join(root,'codex');
 writeFileSync(executable,`#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process'),args=process.argv.slice(2),mode=${JSON.stringify(mode)};
if(args[0]==='--version'){console.log('controlled Codex');process.exit(0)}
if(args[0]==='sandbox'){if(mode==='preflight-fail')process.exit(9);process.exit(0)}
if(args[0]!=='exec'||!args.includes('--ignore-user-config')||!args.some(a=>a.includes('default_permissions'))||args.includes('--sandbox'))process.exit(7);
process.chdir(args[args.indexOf('--cd')+1]);let prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{
 const stage=prompt.match(/Activity turn: ([a-z-]+)/)?.[1]??'legacy';
 fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({stage,args,prompt})+'\\n');
 const count=fs.readFileSync(${JSON.stringify(calls)},'utf8').trim().split('\\n').length;
 console.log(JSON.stringify({type:'thread.started',thread_id:mode==='wrong-thread'&&count>1?'wrong':'workflow-thread'}));
 if(mode===stage+'-timeout'){setInterval(()=>{},1000);return;}
 const result={status:'completed',summary:'Observed bounded result',blockers:[],findings:[{summary:'Observed source',evidence:['source.txt'],uncertainty:'none'}],activities:[],regression:null,reviewFindings:[],requests:[]};
 if(mode==='verify-timeout'&&stage==='implementation')fs.writeFileSync('tests/marker','hang');
 if(stage==='specification'&&mode!=='no-changes'){
  fs.writeFileSync('docs/behavior.md','Source must become after');
  fs.writeFileSync('tests/regression.cjs',"if(require('fs').readFileSync('source.txt','utf8')!=='after')throw new Error('BOUNDARY_EXPECTED');");
  result.regression={verificationIndex:0,exitCode:1,outputIncludes:'BOUNDARY_EXPECTED'};
  result.activities=[{activity:'research',status:'skipped',summary:'Local objective needs no external sources',sources:[]},{activity:'documentation',status:'completed',summary:'Documented behavior',sources:['docs/behavior.md']},{activity:'testing',status:'completed',summary:'Added regression',sources:['tests/regression.cjs']}];
  if(mode==='early-implementation')fs.writeFileSync('source.txt','after');
  if(mode==='wrong-red')result.regression.outputIncludes='NOT_THE_ASSERTION';
 }
 if(stage==='implementation'||stage==='correction'){
  fs.writeFileSync('source.txt',mode==='exhaust'||((mode==='repair'||mode==='weak-test')&&stage==='implementation')?'broken':'after');
  result.activities=[{activity:'implementation',status:'completed',summary:'Implemented change',sources:['source.txt']}];
  if(mode==='scope')fs.writeFileSync('outside.txt','unauthorized');
  if(mode==='ignored')fs.writeFileSync('.env','unknown');
  if(mode==='commit'){cp.execFileSync('git',['add','.']);cp.execFileSync('git',['commit','-m','unauthorized']);}
  if(mode==='symlink')fs.symlinkSync('/tmp','new.txt');
  if(mode==='rename'){fs.renameSync('source.txt','new.txt');cp.execFileSync('git',['add','.']);}
  if(mode==='index-only'){cp.execFileSync('git',['add','source.txt']);fs.writeFileSync('source.txt','before');}
  if(mode==='masked-symlink'){fs.symlinkSync('source.txt','new.txt');cp.execFileSync('git',['add','new.txt']);fs.unlinkSync('new.txt');fs.writeFileSync('new.txt','regular');}
  if(mode==='staged-scope'){fs.writeFileSync('outside.txt','hidden');cp.execFileSync('git',['add','outside.txt']);fs.unlinkSync('outside.txt');}
  if(mode==='weak-test')fs.writeFileSync('tests/regression.cjs','// weakened test');
 }
 if(stage==='review'){
  result.activities=[{activity:'review',status:'completed',summary:'Reviewed diff',sources:['source.txt']},{activity:'release',status:'completed',summary:'Caller integration handoff',sources:[]}];
  if(mode==='review-write')fs.writeFileSync('source.txt','review mutation');
  if(mode==='review-repair'&&count===3)result.reviewFindings=['Needs a corrective pass'];
 }
 if(mode==='blocked'||mode==='unknown-owner'){
  result.status='blocked';result.blockers=['Another owner must change its contract'];result.requests=[{fromComponent:'sample',ownerId:mode==='unknown-owner'?'missing':'dependency',request:'Provide dependency contract',evidence:['source.txt'],acceptanceCriteria:['Contract supports behavior'],reason:'Outside this assignment'}];
 }
 if(mode==='research-write'&&stage==='research')fs.writeFileSync('source.txt','unauthorized');
 console.log(JSON.stringify({type:'item.completed',item:{id:'result',type:'agent_message',text:mode==='malformed'?'invalid':JSON.stringify(result)}}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:count*10,cached_input_tokens:0,output_tokens:count*2}}));
});`,{mode:0o755});
 const commit=()=>{git('add','.');git('commit','-m','fixture');};commit();
 const env={...process.env,ARCNEXUS_STATE_DIR:state};
 const run=(...args)=>spawnSync(process.execPath,[cli,'run','sample','Improve behavior','--project',repo,'--codex-path',executable,...args],{encoding:'utf8',env,timeout:30000});
 return {root,repo,state,calls,component,executable,env,git,commit,run};
}
