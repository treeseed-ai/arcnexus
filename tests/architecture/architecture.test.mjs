import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,readFileSync,renameSync} from 'node:fs';
import {stringify} from 'yaml';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const cli=resolve('dist/cli.js');
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'architecture-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo');mkdirSync(repo);const git=(...args)=>{const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
 const put=(path,v)=>{mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),JSON.stringify(v));};
 const common={schemaVersion:1,repository:'sample',purpose:'Own sample behavior',path:'.',objectives:[],constraints:[],questions:[],patterns:[],interfaces:[],documentation:['README.md'],tests:['test.mjs'],relatedIds:[],role:'engineer',executionProfile:'luna',access:{readPaths:['.'],writeDirectories:['.']},allowedWritePaths:['source.txt'],verification:[{command:'node',args:['--version']}]};
 put('architecture/components/platform.json',{...common,id:'platform',type:'platform',allowedWritePaths:['.']});
 put('architecture/components/package.json',{...common,id:'package',type:'package',parentId:'platform',allowedWritePaths:['.'],members:{foundations:[],dependencies:[],gateways:[],libraries:['sample'],releases:[]}});
 const component={...common,id:'sample',type:'library',parentId:'package'};put('architecture/components/sample.json',component);
 put('architecture/roles/engineer.json',{schemaVersion:1,id:'engineer',purpose:'Engineering',responsibilities:['Verify bounded work'],activities:['research','documentation','testing','implementation','review','release']});
 put('architecture/execution-profiles/luna.yaml',{schemaVersion:1,id:'luna',model:'gpt-6-luna',reasoning:'medium',webSearch:'live',timeoutSeconds:900,commandTimeoutSeconds:120,maxTurns:3,maxCorrectiveTurns:2});
 put('architecture/environment.json',{schemaVersion:1,prerequisites:[],setup:[],generatedDirectories:[]});
 writeFileSync(join(repo,'source.txt'),'before');writeFileSync(join(repo,'README.md'),'Sample');writeFileSync(join(repo,'test.mjs'),'');
 const commit=()=>{git('add','.');git('commit','-m','fixture');};commit();
 const run=(...args)=>spawnSync(process.execPath,[cli,...args,'--project',repo],{encoding:'utf8',env:{...process.env,ARCNEXUS_STATE_DIR:join(root,'state')}});
 return {root,repo,component,put,commit,run};
}
test('built CLI reads YAML at a captured revision and snapshots source hashes',t=>{
 const f=fixture(t);
 for(const path of ['components/sample','environment']) {
  const source=join(f.repo,'architecture',path+'.json');
  const value=JSON.parse(readFileSync(source,'utf8'));
  renameSync(source,source.replace('.json','.yaml'));
  writeFileSync(source.replace('.json','.yaml'),stringify(value));
 }
 f.commit();
 const r=f.run('inspect','sample','Improve behavior','--json');
 assert.equal(r.status,0,r.stderr);
 const snapshots=JSON.parse(r.stdout).configurationSources;
 const source=snapshots.find(s=>s.path==='architecture/components/sample.yaml');
 assert.match(source.sourceHash,/^[a-f0-9]{64}$/);
 assert.match(source.normalizedHash,/^[a-f0-9]{64}$/);
 assert.match(source.text,/id: sample/);
 assert.equal(f.run('validate').status,0);
});
test('built CLI rejects ambiguous JSON and YAML identities',t=>{
 const f=fixture(t);writeFileSync(join(f.repo,'architecture/components/sample.yaml'),stringify(f.component));f.commit();
 const r=f.run('validate');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/Duplicate|Ambiguous/);
});
test('built validate enforces declared maintained-file ownership',t=>{
 const f=fixture(t);
 f.put('architecture/ownership.json',{schemaVersion:1,maintainedPaths:['source.txt'],owners:[{component:'sample',paths:['other.txt'],publicModules:[],directoryExceptions:['.']}]});
 f.commit();const r=f.run('validate');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/source.txt.*owner|owner.*source.txt/);
});
test('built validate rejects overlapping ownership even without changed files',t=>{
 const f=fixture(t);
 f.put('architecture/components/other.json',{...f.component,id:'other',allowedWritePaths:['source.txt']});
 f.put('architecture/ownership.json',{schemaVersion:1,maintainedPaths:['source.txt'],owners:['sample','other'].map(component=>({component,paths:['source.txt'],publicModules:[],directoryExceptions:['.']}))});
 f.commit();const r=f.run('validate');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/owner/);
});
test('built validate rejects a sandbox directory outside declared ownership',t=>{
 const f=fixture(t);
 f.put('architecture/ownership.json',{schemaVersion:1,maintainedPaths:['source.txt'],owners:[{component:'sample',paths:['source.txt'],publicModules:[],directoryExceptions:[]}]});
 f.commit();const r=f.run('validate');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/Write directory outside ownership/);
});
test('built inspect preserves normalized equivalence and original source bytes',t=>{
 const f=fixture(t),file=join(f.repo,'architecture/components/sample.json');
 const before=JSON.parse(f.run('inspect','sample','Check hashes','--json').stdout);
 rmSync(file);writeFileSync(file.replace('.json','.yaml'),'# readable definition\n'+stringify(f.component));f.commit();
 const after=JSON.parse(f.run('inspect','sample','Check hashes','--json').stdout);
 const first=before.configurationSources.find(s=>s.path.endsWith('/sample.json'));
 const second=after.configurationSources.find(s=>s.path.endsWith('/sample.yaml'));
 assert.equal(first.normalizedHash,second.normalizedHash);assert.notEqual(first.sourceHash,second.sourceHash);
 assert.match(second.text,/^# readable definition/);
});
for(const text of ['id: sample\nid: other\n','id: &identity sample\npurpose: *identity\n','id: !custom sample\n','id: sample\n---\nid: other\n','? [a, b]\n: value\n','<<: {id: sample}\n'])test('built CLI rejects restricted YAML: '+text,t=>{
 const f=fixture(t);rmSync(join(f.repo,'architecture/components/sample.json'));
 writeFileSync(join(f.repo,'architecture/components/sample.yaml'),text);f.commit();
 const r=f.run('validate');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/sample.yaml/);
});
test('built inspect resolves immutable hierarchy without state or inference',t=>{
 const f=fixture(t),r=f.run('inspect','sample','Improve behavior','--json');assert.equal(r.status,0,r.stderr);
 const v=JSON.parse(r.stdout);assert.deepEqual(v.context.map(c=>c.id),['platform','package','sample']);assert.equal(v.executionProfile.model,'gpt-6-luna');assert.match(v.digest,/^[a-f0-9]{64}$/);assert.equal(existsSync(join(f.root,'state')),false);
 assert.equal(f.run('validate').status,0);
});
for(const [name,mutate] of [
 ['version',c=>c.schemaVersion=99],['unknown field',c=>c.surprise=true],['missing parent',c=>c.parentId='missing'],['cycle',c=>c.parentId='sample'],['escaping path',c=>c.path='../escape'],['uncovered write',c=>c.access.writeDirectories=['docs']],['ownership',c=>c.repository='other'],
])test(`catalog rejects ${name}`,t=>{const f=fixture(t);mutate(f.component);f.put('architecture/components/sample.json',f.component);f.commit();const r=f.run('validate');assert.equal(r.status,2,r.stderr);});
test('assignment narrows but cannot widen scope and has a stable digest',t=>{
 const f=fixture(t),file=join(f.root,'assignment.json');const assignment={schemaVersion:1,objective:'Improve behavior',kind:'change',expectedOutcome:'Verified behavior',acceptanceCriteria:['Keep public interface'],allowedWritePaths:['source.txt'],hostChecks:[]};writeFileSync(file,JSON.stringify(assignment));
 const r=f.run('inspect','sample','--assignment',file,'--json');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).digest,JSON.parse(f.run('inspect','sample','--assignment',file,'--json').stdout).digest);
 assignment.allowedWritePaths=['outside.txt'];writeFileSync(file,JSON.stringify(assignment));assert.equal(f.run('inspect','sample','--assignment',file).status,2);
});
test('unused invalid definition is rejected and dirty working definitions cannot change inspection',t=>{
 const f=fixture(t);f.component.purpose='Uncommitted purpose';f.put('architecture/components/sample.json',f.component);
 const r=f.run('inspect','sample','Improve behavior','--json');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).context.at(-1).purpose,'Own sample behavior');
 f.put('architecture/components/unused.json',{...f.component,id:'unused',parentId:'missing'});f.commit();assert.equal(f.run('validate').status,2);
});
test('related context does not widen authority and ancestor narrowing fails',t=>{
 const f=fixture(t);f.put('architecture/components/related.json',{...f.component,id:'related',allowedWritePaths:['other.txt']});f.component.relatedIds=['related'];f.put('architecture/components/sample.json',f.component);f.commit();
 const r=f.run('inspect','sample','Improve behavior','--json');assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.deepEqual(result.allowedWritePaths,['source.txt']);assert.equal(result.related[0].id,'related');
 f.put('architecture/components/platform.json',{...f.component,id:'platform',type:'platform',parentId:undefined,allowedWritePaths:['docs'],relatedIds:[]});f.commit();assert.equal(f.run('validate').status,2);
});
test('host acceptance snapshots preserve module extensions and declared relative imports',async t=>{
 const f=fixture(t),check=join(f.root,'check.mjs'),helper=join(f.root,'helper.mjs'),file=join(f.root,'assignment.json');
 writeFileSync(check,"import {value} from './helper.mjs';if(value!==7)process.exit(2)");writeFileSync(helper,'export const value=7;');
 writeFileSync(file,JSON.stringify({schemaVersion:1,objective:'Improve behavior',kind:'change',expectedOutcome:'Checked',acceptanceCriteria:['External check'],hostChecks:[{id:'check',command:process.execPath,args:[check],artifacts:[check,helper]}]}));
 const r=f.run('inspect','sample','--assignment',file,'--json');assert.equal(r.status,0,r.stderr);
 const {materializeChecks}=await import("../../dist/architecture/assignment.js");const [command]=materializeChecks(JSON.parse(r.stdout),join(f.root,'captured'));
 writeFileSync(helper,'throw new Error("mutable external input");');const result=spawnSync(command.command,command.args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
