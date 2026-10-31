import {parse} from 'yaml';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
test('built inspect assigns every real source module to one executable owner',()=>{
 const components=readdirSync('architecture/components').map(f=>parse(readFileSync('architecture/components/'+f,'utf8'))).filter(c=>!['platform','package'].includes(c.type));
 const owners=components.map(c=>{
  const r=spawnSync(process.execPath,[resolve('dist/cli.js'),'inspect',c.id,'Inspect ownership','--project',process.cwd(),'--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).context.at(-1);
 });
 const files=readdirSync('src',{recursive:true}).filter(p=>p.endsWith('.ts'));
 for(const name of files){const path='src/'+name;
  assert.equal(owners.filter(c=>c.allowedWritePaths.some(p=>p===path||path.startsWith(p+'/'))).length,1,`${path} must have one executable owner`);
 }
});
