import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {workflowFixture,cli} from './workflow-fixture.mjs';
test('built SDK launcher stops Codex after hard host loss',async t=>{
 const f=workflowFixture(t,'specification-timeout'),child=spawn(process.execPath,[cli,'run','sample','Bounded change','--project',f.repo,'--codex-path',f.executable],{env:f.env,stdio:'ignore'});let pid;
 t.after(()=>{child.kill('SIGKILL');if(pid)try{process.kill(-pid,'SIGKILL');}catch{}});
 const deadline=Date.now()+10000;
 while(Date.now()<deadline&&!pid){if(existsSync(f.calls)&&existsSync(join(f.state,'runs')))for(const id of readdirSync(join(f.state,'runs'))){const p=join(f.state,'runs',id,'codex.pid');if(existsSync(p))pid=Number(readFileSync(p,'utf8'));}if(!pid)await new Promise(r=>setTimeout(r,25));}
 assert.ok(pid,'controlled Codex reached execution');const exited=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await exited;
 const {groupMembers}=await import('../../dist/service-state.js');const until=Date.now()+5000;while(groupMembers(pid).length&&Date.now()<until)await new Promise(r=>setTimeout(r,25));assert.deepEqual(groupMembers(pid),[],'no steward process survives host loss');
});
