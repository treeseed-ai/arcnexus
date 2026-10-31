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
 if(mode==='success'){fs.writeFileSync('source.txt','after');fs.writeFileSync('new.txt','new file');}
 if(mode==='rename'){fs.renameSync('source.txt','new.txt');cp.execFileSync('git',['add','.']);}
 if(mode==='ignored')fs.writeFileSync('.env','unknown');
 if(mode==='scope')fs.writeFileSync('outside.txt','oops');
 if(mode==='verify')fs.writeFileSync('source.txt','broken');
 if(mode==='commit'){fs.writeFileSync('source.txt','after');cp.execFileSync('git',['add','.']);cp.execFileSync('git',['commit','-m','bad commit']);}
 if(mode==='symlink')fs.symlinkSync('/tmp','new.txt');
 const result={status:mode==='blocked'?'blocked':'completed',summary:'test',blockers:mode==='blocked'?['needs guidance']:[]};
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
