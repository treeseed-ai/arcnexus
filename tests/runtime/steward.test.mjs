import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
const cli=resolve('dist/cli.js');
function fixture(t,mode='success') {
 const root=mkdtempSync(join(tmpdir(),'arcnexus-steward-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo'),state=join(root,'state');mkdirSync(join(repo,'architecture/components'),{recursive:true});
 const sdkArgs=join(root,'sdk-args.json');
 const git=(...args)=>{const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
 writeFileSync(join(repo,'source.txt'),'before');writeFileSync(join(repo,'.gitignore'),'.env\n');
 writeFileSync(join(repo,'architecture/environment.json'),JSON.stringify({prerequisites:[],setup:[],generatedDirectories:[]}));
 const component={id:'sample',type:'library',purpose:'test responsibility',path:'source.txt',objectives:[],constraints:[],allowedWritePaths:['source.txt','new.txt'],verification:[{command:'node',args:['-e',"if(require('fs').readFileSync('source.txt','utf8')==='broken')process.exit(1)"]}]};
 writeFileSync(join(repo,'architecture/components/sample.json'),JSON.stringify(component));
 const fake=join(root,'fake-codex');
 writeFileSync(fake,`#!/usr/bin/env node\nconst fs=require('fs'), cp=require('child_process');
 const args=process.argv.slice(2); if(!args.includes('--ignore-user-config')||!args.includes('workspace-write'))process.exit(7);
 fs.writeFileSync(${JSON.stringify(sdkArgs)},JSON.stringify(args));
 const cwd=args[args.indexOf('--cd')+1];process.chdir(cwd);
 let prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{
 const mode=${JSON.stringify(mode)};
 console.log(JSON.stringify({type:'thread.started',thread_id:'test-thread'}));
 if(mode==='timeout'){setInterval(()=>{},1000);return;}
 if(mode==='success'||mode==='sandbox'){fs.writeFileSync('source.txt','after');fs.writeFileSync('new.txt','new file');}
 if(mode==='rename'){fs.renameSync('source.txt','new.txt');cp.execFileSync('git',['add','.']);}
 if(mode==='ignored')fs.writeFileSync('.env','unknown');
 if(mode==='scope')fs.writeFileSync('outside.txt','oops');
 if(mode==='verify')fs.writeFileSync('source.txt','broken');
 if(mode==='commit'){fs.writeFileSync('source.txt','after');cp.execFileSync('git',['add','.']);cp.execFileSync('git',['commit','-m','bad commit']);}
 if(mode==='symlink')fs.symlinkSync('/tmp','new.txt');
 if(mode==='masked_outside'){
   fs.writeFileSync('outside.txt','staged secret');cp.execFileSync('git',['add','outside.txt']);fs.unlinkSync('outside.txt');
 }
 if(mode==='index_only'){
   fs.writeFileSync('source.txt','staged version');cp.execFileSync('git',['add','source.txt']);fs.writeFileSync('source.txt','before');
 }
 if(mode==='masked_symlink'){
   fs.symlinkSync('source.txt','new.txt');cp.execFileSync('git',['add','new.txt']);fs.unlinkSync('new.txt');fs.writeFileSync('new.txt','regular restoration');
 }
 const result={status:mode==='blocked'?'blocked':'completed',summary:mode==='sandbox'?'Checks unavailable in sandbox; host verification required':'test',blockers:mode==='blocked'?['needs guidance']:[]};
 console.log(JSON.stringify({type:'item.completed',item:{id:'final',type:'agent_message',text:mode==='malformed'?'bad':JSON.stringify(result)}}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}}));
 });`,{mode:0o755});
 const commit=()=>{git('add','.');git('commit','-m','fixture');};commit();
 const run=(...args)=>spawnSync(process.execPath,[cli,'run','sample','Improve sample','--project',repo,'--codex-path',fake,...args],{encoding:'utf8',env:{...process.env,ARCNEXUS_STATE_DIR:state}});
 return {root,repo,state,git,component,commit,run,fake,sdkArgs};
}
for(const [name,options,expected] of [['default model',[],'gpt-6-luna'],['explicit model',['--model','synthetic-worker-model'],'synthetic-worker-model']])test(`run selects ${name} in report and SDK arguments`,t=>{
 const f=fixture(t),r=f.run(...options);assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
 assert.equal(record.settings.model,expected);assert.ok(JSON.parse(readFileSync(f.sdkArgs,'utf8')).includes(expected));
});
test('built CLI runs the SDK boundary and retains observed changes, context and evidence',t=>{
 const f=fixture(t);const r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
 assert.equal(record.status,'completed');assert.equal(record.threadId,'test-thread');assert.equal(record.changes.length,2);
 assert.equal(record.commands.length,2);assert.equal(record.context[0].id,'sample');
 assert.match(readFileSync(join(f.state,'runs',record.id,'changes.patch'),'utf8'),/after/);
 assert.match(readFileSync(join(f.state,'runs',record.id,'report.md'),'utf8'),/completed/);
 assert.equal(f.git('status','--porcelain'),'');
});
test('built CLI records execution inputs, requested SDK capabilities and available instruction provenance before execution',t=>{
 const f=fixture(t,'sandbox');writeFileSync(join(f.repo,'AGENTS.md'),'target instructions');f.commit();
 const r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout),dir=join(f.state,'runs',record.id);
 const args=JSON.parse(readFileSync(f.sdkArgs,'utf8')),execution=JSON.parse(readFileSync(join(dir,'execution.json'),'utf8'));
 assert.ok(args.includes('web_search="live"'));assert.ok(args.some(a=>a.includes('features.multi_agent=false')));assert.ok(args.some(a=>a.includes('features.multi_agent_v2=false')));
 assert.equal(record.settings.webSearch,'live');assert.equal(record.settings.network,false);
 assert.match(readFileSync(join(dir,'prompt.txt'),'utf8'),/primary sources and URLs/);
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'response-schema.json'),'utf8')).required,['status','summary','blockers']);
 assert.equal(execution.settings.webSearch,'live');assert.equal(execution.settings.network,false);
 assert.ok(execution.instructionProvenance.some(x=>x.path==='AGENTS.md'&&x.sha256));
 assert.ok(execution.sdk.version);assert.ok(execution.cliVersion);
});
test('completed sandbox-limited result remains eligible only for host verification',t=>{
 const f=fixture(t,'sandbox'),r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
 assert.equal(record.agent.status,'completed');assert.match(record.agent.summary,/sandbox/);assert.equal(record.stage,'finished');assert.equal(record.commands.length,2);
});
test('built CLI rejects a staged outside-scope edit masked by restoring the working file',t=>{
 const f=fixture(t,'masked_outside'),r=f.run();assert.equal(r.status,1,r.stderr);assert.match(JSON.parse(r.stdout).error,/Out-of-scope change: outside\.txt/);
});
test('built CLI retains separate evidence for an in-scope index-only change',t=>{
 const f=fixture(t,'index_only'),r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout),dir=join(f.state,'runs',record.id);
 assert.deepEqual(record.changes,[{kind:'M',path:'source.txt'}]);
 assert.deepEqual(record.stagedChanges,[{kind:'M',path:'source.txt'}]);assert.deepEqual(record.unstagedChanges,[{kind:'M',path:'source.txt'}]);
 assert.match(readFileSync(join(dir,'staged.patch'),'utf8'),/staged version/);assert.match(readFileSync(join(dir,'unstaged.patch'),'utf8'),/staged version/);
 assert.equal(readFileSync(join(dir,'changes.patch'),'utf8'),'');assert.deepEqual(JSON.parse(readFileSync(join(dir,'new-files.json'),'utf8')),{});
});
test('built CLI rejects a staged symlink masked by a regular working file',t=>{
 const f=fixture(t,'masked_symlink'),r=f.run();assert.equal(r.status,1,r.stderr);assert.match(JSON.parse(r.stdout).error,/Symlink change is unsupported: new\.txt/);
});
for(const mode of ['scope','ignored','verify','commit','symlink','malformed','blocked','no_changes'])test(`run rejects ${mode}`,t=>{
 const f=fixture(t,mode),r=f.run();assert.equal(r.status,1,r.stderr);const record=JSON.parse(r.stdout);
 assert.notEqual(record.status,'completed');assert.ok(record.error||record.status==='blocked'||record.status==='no_changes');
});
test('run timeout stops SDK and retains evidence',t=>{const f=fixture(t,'timeout'),r=f.run('--timeout-seconds','0.4');assert.equal(r.status,1);assert.match(r.stderr,/timed out|abort/i);});
test('missing and cyclic ancestors are rejected before inference',t=>{
 const f=fixture(t);f.component.parentId='missing';writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();assert.match(f.run().stderr,/missing/);
 writeFileSync(join(f.repo,'architecture/components/missing.json'),JSON.stringify({...f.component,id:'missing',parentId:'sample',type:'package'}));f.commit();const result=f.run();assert.equal(result.status,2);assert.match(result.stderr,/cyclic/);
});
test('failing baseline prevents SDK activation',t=>{
 const f=fixture(t);writeFileSync(join(f.repo,'source.txt'),'broken');f.commit();const r=f.run();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).threadId,undefined);
});
test('complete ancestor definitions are captured root to leaf',t=>{
 const f=fixture(t);f.component.parentId='parent';writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));
 writeFileSync(join(f.repo,'architecture/components/parent.json'),JSON.stringify({...f.component,id:'parent',type:'package',parentId:undefined,purpose:'Parent intent',questions:['Question'],patterns:['Pattern']}));f.commit();
 const r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);assert.deepEqual(record.context.map(c=>c.id),['parent','sample']);assert.deepEqual(record.context[0].patterns,['Pattern']);
});
test('staged rename accounts for old and new paths',t=>{
 const f=fixture(t,'rename');f.component.verification=[{command:'node',args:['-e','process.exit(0)']}];writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 const r=f.run();assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).changes,[{kind:'A',path:'new.txt'},{kind:'D',path:'source.txt'}]);
});
test('target Codex config is rejected before inference',t=>{
 const f=fixture(t);mkdirSync(join(f.repo,'.codex'));writeFileSync(join(f.repo,'.codex/config.toml'),'model="unwanted"');f.commit();
 const r=f.run();assert.equal(r.status,2);assert.match(r.stderr,/configuration/);assert.equal(JSON.parse(r.stdout).threadId,undefined);
});
test('timeout during final verification retains agent result',t=>{
 const f=fixture(t);f.component.verification=[{command:'node',args:['-e',"if(require('fs').readFileSync('source.txt','utf8')==='after')setInterval(()=>{},1000)"]}];writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 const r=f.run('--timeout-seconds','1');assert.equal(r.status,1);const record=JSON.parse(r.stdout);assert.equal(record.stage,'verification');assert.equal(record.agent.status,'completed');
});
test('SIGINT during agent execution records cancellation',async t=>{
 const f=fixture(t,'timeout');const child=spawn(process.execPath,[cli,'run','sample','Improve sample','--project',f.repo,'--codex-path',f.fake],{env:{...process.env,ARCNEXUS_STATE_DIR:f.state}});
 let out='';child.stdout.on('data',b=>out+=b);const closed=new Promise(r=>child.on('close',r));
 await new Promise(r=>setTimeout(r,600));child.kill('SIGINT');assert.equal(await closed,130);assert.equal(JSON.parse(out).status,'cancelled');
});

test('final verification cannot hide an out-of-scope staged change',t=>{
 const f=fixture(t);f.component.verification=[{command:'node',args:['-e',"const fs=require('fs'),cp=require('child_process');if(fs.readFileSync('source.txt','utf8')==='after'){fs.writeFileSync('outside.txt','staged');cp.execFileSync('git',['add','outside.txt']);fs.unlinkSync('outside.txt');}"]}];
 writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 const r=f.run();assert.equal(r.status,1,r.stderr);const record=JSON.parse(r.stdout);assert.equal(record.stage,'verification');assert.match(record.error,/Out-of-scope/);assert.ok(record.stagedChanges.some(c=>c.path==='outside.txt'));
});

test('sandbox handoff does not bypass a failing host check',t=>{
 const f=fixture(t,'sandbox');f.component.verification=[{command:'node',args:['-e',"if(require('fs').readFileSync('source.txt','utf8')==='after')process.exit(5)"]}];writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 const r=f.run();assert.equal(r.status,1,r.stderr);const record=JSON.parse(r.stdout);assert.equal(record.agent.status,'completed');assert.equal(record.status,'failed');assert.equal(record.stage,'verification');
});
