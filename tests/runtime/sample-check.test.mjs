import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
for(const [name,implementation,expected] of [
 ['missing','',1],['wrong boundary','export const isSessionExpired=(expiry,now)=>now>expiry;',1],
 ['correct','export const isSessionExpired=(expiry,now)=>now>=expiry;',0],
])test(`independent checker: ${name}`,t=>{
 const root=mkdtempSync(join(tmpdir(),'arcnexus-independent-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));
 writeFileSync(join(root,'src/identity.mjs'),`export const normalizeIdentity = value => value.trim().toLowerCase();\n${implementation}`);
 const r=spawnSync(process.execPath,['scripts/check-sample.mjs',root],{encoding:'utf8'});
 assert.equal(r.status,expected,r.stderr);
 if(expected===1)assert.match(r.stderr,/isSessionExpired|AssertionError/);
});
