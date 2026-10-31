import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {workflowFixture} from './workflow-fixture.mjs';
const calls=f=>readFileSync(f.calls,'utf8').trim().split('\n').map(JSON.parse);
test('bound command executes from supplied context with reset PATH and read-only tool visibility',t=>{
 const f=workflowFixture(t),bin=join(f.root,'tool directory');mkdirSync(bin);
 const tool=join(bin,'target-node');writeFileSync(tool,'#!/bin/sh\nexec '+process.execPath+' "$@"\n',{mode:0o755});
 writeFileSync(join(f.repo,'verify.cjs'),readFileSync(join(f.repo,'verify.cjs'),'utf8')+"if(require('child_process').spawnSync('target-node',['-e','process.exit(0)']).status!==0)throw new Error('NESTED_TOOL_UNAVAILABLE');");
 f.component.verification[0].command='target-node';writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 const binding=join(f.root,'bindings.json');writeFileSync(binding,JSON.stringify({schemaVersion:1,repositories:{},tools:{'target-node':tool}}));
 let executable=readFileSync(f.executable,'utf8');
 executable=executable.replace("const stage=prompt.match",`const commands=JSON.parse(prompt.split('Captured verification commands (zero-based index): ')[1].split('\\n')[0]);
 const supplied=JSON.parse(prompt.split('Target command environment: ')[1].split('\\n')[0]);
 const probe=cp.spawnSync(commands[0].command,commands[0].args,{env:{...process.env,PATH:'/nonexistent',...supplied}});
 if(probe.status!==0)throw new Error('SUPPLIED_TOOL_UNAVAILABLE');
 const stage=prompt.match`);
 writeFileSync(f.executable,executable);
 const r=f.run('--kind','research','--bindings',binding);assert.equal(r.status,0,r.stderr);
 const record=JSON.parse(r.stdout);assert.equal(record.settings.filesystem[bin],'read');
 assert.ok(calls(f)[0].prompt.includes(tool));assert.ok(calls(f)[0].args.some(a=>a.includes(JSON.stringify(bin)+'="read"')));
});
test('review receives first-parent diff with hash, no unrelated history',t=>{
 const f=workflowFixture(t);writeFileSync(join(f.repo,'docs/behavior.md'),'PINNED_REVIEW_CHANGE');f.commit();
 const r=f.run('--kind','review');assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout),prompt=calls(f)[0].prompt;
 assert.match(prompt,/PINNED_REVIEW_CHANGE/);assert.match(prompt,/Host review evidence/);
 assert.equal(record.turns[0].reviewEvidence.basis,'base-first-parent');assert.match(record.turns[0].reviewEvidence.sha256,/^[a-f0-9]{64}$/);
});
test('root revision review and candidate review both receive readable changes',t=>{
 for(const kind of ['review','change']){const f=workflowFixture(t),r=f.run('--kind',kind);assert.equal(r.status,0,r.stderr);
 const p=calls(f).at(-1).prompt;assert.match(p,/Host review evidence/);assert.match(p,kind==='review'?/Own sample behavior/:/BOUNDARY_EXPECTED/);
 }
});
test('revision review evidence excludes paths outside declared read authority',t=>{
 const f=workflowFixture(t);f.component.access={readPaths:['docs'],writeDirectories:['docs','tests']};f.component.allowedWritePaths=['docs','tests'];writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));f.commit();
 writeFileSync(join(f.repo,'source.txt'),'SECRET_OUTSIDE_READ_SCOPE');writeFileSync(join(f.repo,'docs/behavior.md'),'VISIBLE_CHANGE');f.commit();
 const r=f.run('--kind','review');assert.equal(r.status,0,r.stderr);const prompt=calls(f)[0].prompt;assert.match(prompt,/VISIBLE_CHANGE/);assert.doesNotMatch(prompt,/SECRET_OUTSIDE_READ_SCOPE/);
});
test('specification delegates unavailable sandbox checks to the authoritative host',t=>{
 const f=workflowFixture(t);let program=readFileSync(f.executable,'utf8');
 program=program.replace("if(stage==='specification'&&mode!=='no-changes'){",`if(stage==='specification'&&mode!=='no-changes'){
  if(!prompt.includes('If sandbox restrictions prevent running the regression'))throw new Error('HOST_CHECK_HANDOFF_MISSING');
  result.findings.push({summary:'Sandbox regression execution unavailable',evidence:['Observed EPERM from sandbox command'],uncertainty:'Proposed assertion must be checked by host'});`);
 writeFileSync(f.executable,program);const r=f.run();assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);
 assert.equal(report.outcome,'ready_for_integration');assert.ok(report.commands.some(c=>c.exitCode===1));assert.ok(report.regressionCheckpoint.outputIncludes==='BOUNDARY_EXPECTED');
});
test('specification exposes both required source changes in the actual turn prompt',t=>{
 const f=workflowFixture(t),r=f.run();assert.equal(r.status,0,r.stderr);
 const prompt=calls(f).find(c=>c.stage==='specification').prompt;
 assert.match(prompt,/actual edit to at least one.*documentation/);assert.match(prompt,/host rejects this checkpoint if either kind of change is missing/);
});
