import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {workflowFixture,cli} from './workflow-fixture.mjs';
test('SQLite delivery and readiness commit atomically; built viewers retain ordered evidence',async t=>{
 const f=workflowFixture(t),{WorkdayStore}=await import('../../dist/workday-store.js');
 const directory=join(f.state,'workdays','one');mkdirSync(directory,{recursive:true});
 const store=new WorkdayStore(join(directory,'workday.sqlite'),true);
 try{
  store.initialize('one',{base:f.git('rev-parse','HEAD')},['sample','dependency']);
  store.commit('request.delivered',{id:'request-1'},{assignments:[{id:'dependency',status:'ready',data:{}}],messages:[{id:'request-1',from:'sample',to:'dependency',kind:'request',payload:{contract:'sample'}}]});
  assert.throws(()=>store.commit('duplicate',{}, {assignments:[{id:'dependency',status:'incorrect',data:{}}],messages:[{id:'request-1',from:'sample',to:'dependency',kind:'request',payload:{}}]}));
  assert.equal(store.snapshot().assignments.find(a=>a.id==='dependency').status,'ready');assert.equal(store.events().length,2);
  store.commit('workday.finished',{}, {workday:{id:'one',status:'completed',data:{}}});
 }finally{store.close();}
 const workday=(...args)=>spawnSync(process.execPath,[cli,'workday',...args],{encoding:'utf8',env:f.env,timeout:10000});
 const status=workday('status','one','--json');assert.equal(status.status,0,status.stderr);assert.equal(JSON.parse(status.stdout).messages.length,1);
 const follow=workday('follow','one','--after','1','--json');assert.equal(follow.status,0,follow.stderr);assert.deepEqual(follow.stdout.trim().split('\n').map(x=>JSON.parse(x).sequence),[2,3]);
 assert.equal(workday('status','missing','--json').status,2);
});
