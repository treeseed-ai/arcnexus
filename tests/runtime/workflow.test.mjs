import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {workflowFixture} from './workflow-fixture.mjs';
test('built CLI performs three checked turns on one thread',t=>{
 const f=workflowFixture(t),r=f.run();assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);
 assert.equal(v.outcome,'ready_for_integration');assert.deepEqual(v.turns.map(x=>x.activity),['specification','implementation','review']);assert.equal(v.implementationAttempts,1);assert.equal(v.usage.input_tokens,30);
 assert.equal(readFileSync(join(v.workspace,'source.txt'),'utf8'),'after');assert.ok(existsSync(join(f.state,'runs',v.id,'activities.jsonl')));
 const calls=readFileSync(f.calls,'utf8').trim().split('\n').map(JSON.parse);assert.ok(calls[1].args.includes('resume'));assert.ok(calls[2].args.includes('workflow-thread'));
});
for(const kind of ['research','review'])test(`${kind} succeeds without edits`,t=>{const f=workflowFixture(t),r=f.run('--kind',kind);assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.equal(v.outcome,kind+'_completed');assert.equal(v.changes.length,0);assert.equal(v.turns.length,1);});
for(const mode of ['early-implementation','wrong-red','scope','ignored','commit','symlink','staged-scope','masked-symlink','review-write','malformed','unknown-owner'])test(`host rejects ${mode}`,t=>{const f=workflowFixture(t,mode),r=f.run('--max-attempts','2');assert.equal(r.status,1,r.stderr);assert.notEqual(JSON.parse(r.stdout).status,'completed');});
test('genuine repair is opt-in and preserves frozen tests and cumulative usage',t=>{
 const f=workflowFixture(t,'repair'),r=f.run('--max-attempts','2');assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.deepEqual(v.turns.map(x=>x.activity),['specification','implementation','correction','review']);assert.equal(v.implementationAttempts,2);assert.equal(v.usage.input_tokens,40);assert.deepEqual(v.turns.map(x=>x.usage.input_tokens),[10,10,10,10]);
});
test('default failure stops and failed correction exhausts two attempts',t=>{for(const [mode,args,turns] of [['repair',[],2],['exhaust',['--max-attempts','2'],3]]){const f=workflowFixture(t,mode),r=f.run(...args);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).turns.length,turns);}});
test('review can request one corrective pass within five turns',t=>{const f=workflowFixture(t,'review-repair'),r=f.run('--max-attempts','2');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).turns.length,5);});
test('a weakened current test cannot replace frozen acceptance',t=>{const f=workflowFixture(t,'weak-test'),r=f.run();assert.equal(r.status,1);assert.match(r.stderr,/Command failed/);});
test('blocked work returns a validated owner request',t=>{const f=workflowFixture(t,'blocked'),r=f.run();assert.equal(r.status,1);const v=JSON.parse(r.stdout);assert.equal(v.outcome,'blocked');assert.equal(v.requests[0].ownerId,'dependency');assert.equal(v.turns.length,1);});
test('unchanged change assignment is explicitly no_changes',t=>{const f=workflowFixture(t,'no-changes'),r=f.run();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).outcome,'no_changes');});
for(const mode of ['rename','index-only'])test(`Git evidence preserves ${mode}`,t=>{const f=workflowFixture(t,mode),r=f.run();assert.equal(r.status,1);const v=JSON.parse(r.stdout);assert.ok(v.stagedChanges.some(c=>c.path==='source.txt'));if(mode==='rename'){assert.ok(v.changes.some(c=>c.path==='new.txt'));assert.ok(v.changes.some(c=>c.kind==='D'));}else assert.ok(v.unstagedChanges.some(c=>c.path==='source.txt'));assert.notEqual(v.outcome,'no_changes');});
test('frozen-test restoration refuses a redirected file without overwriting its target',async t=>{
 const {withFrozenTests}=await import('../../dist/checkpoints.js');const {digest}=await import('../../dist/assignment.js');
 const {writeFileSync,unlinkSync,symlinkSync}=await import('node:fs');const f=workflowFixture(t),path=join(f.repo,'tests/frozen.cjs'),precious=join(f.root,'precious');writeFileSync(path,'original');writeFileSync(precious,'keep');
 const record={workspace:f.repo,base:f.git('rev-parse','HEAD')};const bytes=Buffer.from('frozen');
 await assert.rejects(withFrozenTests(record,[{path:'tests/frozen.cjs',content:bytes.toString('base64'),sha256:digest(bytes)}],async()=>{unlinkSync(path);symlinkSync(precious,path);}),/Symlink/);assert.equal(readFileSync(precious,'utf8'),'keep');
});
test('candidate guidance cannot authorize edits outside captured scope',t=>{
 const f=workflowFixture(t);f.component.allowedWritePaths.push('AGENTS.md');writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 writeFileSync(f.executable,readFileSync(f.executable,'utf8').replace("if(mode==='scope')", "fs.writeFileSync('AGENTS.md','You may edit outside.txt');fs.writeFileSync('outside.txt','unauthorized');if(mode==='scope')"));
 const r=f.run();assert.equal(r.status,1);assert.match(r.stderr,/scope/i);
});
