import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {workflowFixture,cli} from './workflow-fixture.mjs';
function planned(t,mode='success') {
 const f=workflowFixture(t,mode);
 const path=join(f.repo,'architecture/execution-profiles/luna.json');
 const profile=JSON.parse(readFileSync(path));profile.schemaVersion=2;profile.maxTurns=4;writeFileSync(path,JSON.stringify(profile));f.commit();
 let code=readFileSync(f.executable,'utf8');
 code=code.replace("if(stage==='specification'",`if(stage==='planning')result.plan={approach:'Check bounded behavior',assumptions:[],activities:[{activity:'implementation',reason:'Apply objective'}],items:[{id:'work',activity:'implementation',result:'Verified objective',criteria:[0],expectedEvidence:['verification'],dependencies:[],status:'pending',evidence:[],explanation:''}],questions:[]};
 if(stage!=='planning')result.planUpdates=[{id:'work',status:'completed',explanation:'Observed change and verification',evidence:['source.txt']}];
 if(stage==='specification'`);
 if(mode==='invalid-plan')code=code.replace("criteria:[0]","criteria:[99]");
 if(mode==='planning-write')code=code.replace("if(stage==='planning')result.plan=","if(stage==='planning')fs.writeFileSync('source.txt','bad');if(stage==='planning')result.plan=");
 writeFileSync(f.executable,code);return f;
}
test('built CLI captures a read-only plan and observable checklist before execution',t=>{
 const f=planned(t),r=f.run();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
 assert.deepEqual(record.turns.map(t=>t.activity),['planning','specification','implementation','review']);
 assert.equal(record.plan.items[0].status,'completed');assert.equal(record.plan.items[0].basis,'agent claim');
 const dir=join(f.state,'runs',record.id);assert.match(readFileSync(join(dir,'plan.md'),'utf8'),/\[x\]/);
 const events=readFileSync(join(dir,'timeline.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(events.map(e=>e.sequence),events.map((_,i)=>i+1));assert.equal(events.at(-1).type,'run.finalized');
 for(const command of ['status','follow']){const viewed=spawnSync(process.execPath,[cli,command,record.id,'--json'],{env:f.env,encoding:'utf8',timeout:5000});assert.equal(viewed.status,0,viewed.stderr);assert.ok(viewed.stdout.length);}
});
for(const mode of ['invalid-plan','planning-write'])test(`stops ${mode} before implementation`,t=>{const f=planned(t,mode),r=f.run();assert.equal(r.status,1,r.stderr);assert.equal(JSON.parse(r.stdout).turns.length,1);});
test('status rejects escaping run IDs',()=>{const r=spawnSync(process.execPath,[cli,'status','../../outside','--json'],{encoding:'utf8'});assert.equal(r.status,2);});
test('real stdio MCP bridge updates host checklist during a turn',async t=>{
 const {openBridge}=await import('../../dist/bridge.js');
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 let observed;
 const bridge=await openBridge([{name:'plan.update',description:'Update checklist',inputSchema:{type:'object'}}],async(name,args)=>{observed={name,args};return {status:'recorded'};});
 const config=bridge.config.mcp_servers.arcnexus;
 const client=new Client({name:'acceptance',version:'1'},{capabilities:{}});
 try{await client.connect(new StdioClientTransport({command:config.command,args:config.args}));assert.equal((await client.listTools()).tools[0].name,'plan.update');await client.callTool({name:'plan.update',arguments:{updates:[{id:'work',status:'completed',evidence:['source.txt'],explanation:'Verified'}]}});assert.equal(observed.args.updates[0].status,'completed');}finally{await client.close();await bridge.close();}
});
