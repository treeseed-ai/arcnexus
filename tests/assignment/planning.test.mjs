import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {workflowFixture,cli} from "../development-tooling/workflow-fixture.mjs";
function planned(t,mode='success') {
 const f=workflowFixture(t,mode);
 const path=join(f.repo,'architecture/execution-profiles/luna.yaml');
 const profile=JSON.parse(readFileSync(path));profile.schemaVersion=2;profile.maxTurns=4;writeFileSync(path,JSON.stringify(profile));f.commit();
 let code=readFileSync(f.executable,'utf8');
 code=code.replace("process.chdir(args[args.indexOf('--cd')+1]);","const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1]));function strict(s){if(!s||typeof s!=='object')return;if(s.properties&&Object.keys(s.properties).some(k=>!s.required?.includes(k)))throw new Error('STRICT_REQUIRED');if(s.uniqueItems!==undefined)throw new Error('STRICT_UNIQUE_ITEMS');Object.values(s).forEach(v=>Array.isArray(v)?v.forEach(strict):strict(v));}strict(schema);process.chdir(args[args.indexOf('--cd')+1]);");
 code=code.replace("const result={status:","const result={plan:null,planUpdates:[],status:");
 code=code.replace("if(stage==='specification'",`if(stage==='planning')result.plan={approach:'Check bounded behavior',assumptions:[],activities:[{activity:'implementation',reason:'Apply objective'}],items:[{id:'work',activity:'implementation',result:'Verified objective',criteria:[0],expectedEvidence:['verification'],dependencies:[],status:'pending',evidence:[],explanation:''}],questions:[]};
 if(stage!=='planning')result.planUpdates=[{id:'work',status:'completed',explanation:'Observed change and verification',evidence:['source.txt']}];
 if(stage==='specification'`);
 if(mode==='invalid-plan')code=code.replace("criteria:[0]","criteria:[99]");
 if(mode==='planning-write')code=code.replace("if(stage==='planning')result.plan=","if(stage==='planning')fs.writeFileSync('source.txt','bad');if(stage==='planning')result.plan=");
 if(mode==='bridge-update'){
  code=code.replace("process.stdin.on('end',()=>{","process.stdin.on('end',async()=>{");
  code=code.replace("if(stage!=='planning')result.planUpdates=",`if(stage!=='planning'){
   const {Client}=await import(${JSON.stringify('file://'+resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'))});
   const {StdioClientTransport}=await import(${JSON.stringify('file://'+resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'))});
   const option=name=>JSON.parse(args.find(a=>a.startsWith('mcp_servers.arcnexus.'+name+'=')).split('=').slice(1).join('='));
   const client=new Client({name:'controlled-codex',version:'1'},{capabilities:{}});
   await client.connect(new StdioClientTransport({command:option('command'),args:option('args')}));
   const reply=await client.callTool({name:'plan.update',arguments:{updates:[{id:'work',status:'completed',explanation:'Observed through bridge',evidence:['source.txt']}]}});if(reply.isError)throw new Error(JSON.stringify(reply));await client.close();
  }
  if(stage!=='planning')result.planUpdates=`);
 }
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
 const {openBridge}=await import("../../dist/steward/bridge.js");
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 let observed;
 const bridge=await openBridge([{name:'plan.update',description:'Update checklist',inputSchema:{type:'object'}}],async(name,args)=>{observed={name,args};return {status:'recorded'};});
 const config=bridge.config.mcp_servers.arcnexus;
 const client=new Client({name:'acceptance',version:'1'},{capabilities:{}});
 try{await client.connect(new StdioClientTransport({command:config.command,args:config.args}));assert.equal((await client.listTools()).tools[0].name,'plan.update');await client.callTool({name:'plan.update',arguments:{updates:[{id:'work',status:'completed',evidence:['source.txt'],explanation:'Verified'}]}});assert.equal(observed.args.updates[0].status,'completed');}finally{await client.close();await bridge.close();}
});
for(const kind of ['research','review'])test(`planned ${kind} uses two source-read-only turns`,t=>{const f=planned(t),r=f.run('--kind',kind);assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.equal(v.turns.length,2);assert.equal(v.changes.length,0);});
test('planning preserves the single corrective allowance and cumulative usage',t=>{const f=planned(t,'repair'),r=f.run('--max-attempts','2');assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.deepEqual(v.turns.map(t=>t.activity),['planning','specification','implementation','correction','review']);assert.equal(v.implementationAttempts,2);assert.equal(v.usage.input_tokens,50);});
test('checklist completion without evidence stops the assignment',t=>{const f=planned(t);writeFileSync(f.executable,readFileSync(f.executable,'utf8').replace("evidence:['source.txt']}];","evidence:[]}];"));const r=f.run();assert.equal(r.status,1,r.stderr);assert.match(r.stderr,/completion requires evidence/);});
test('timeline reader reports truncation and historical absence',async t=>{const {readTimeline}=await import("../../dist/report/timeline.js");const f=workflowFixture(t);assert.equal(readTimeline(f.root).complete,false);writeFileSync(join(f.root,'timeline.jsonl'),'{"unfinished":');assert.match(readTimeline(f.root).problem,/Incomplete/);});

test('built production SDK passes explicit MCP bridge configuration to the executable',t=>{const f=planned(t,'bridge-update'),r=f.run();assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.ok(v.plan.version>=7);const events=readFileSync(join(f.state,'runs',v.id,'timeline.jsonl'),'utf8');assert.match(events,/plan.updated/);});

test('research executes the plan now instead of deferring work to an imaginary later turn',t=>{
 const f=planned(t);let code=readFileSync(f.executable,'utf8');code=code.replace("console.log(JSON.stringify({type:'item.completed'", "if(stage==='research'&&!prompt.includes('This is the only execution turn')){result.status='failed';result.blockers=['Deferred operations to an imaginary later execution turn'];}console.log(JSON.stringify({type:'item.completed'");writeFileSync(f.executable,code);const r=f.run('--kind','research');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).turns.length,2);
});

test('built SDK schema constrains final updates to steward items and rejects forged host completion',t=>{
 const f=planned(t);
 let code=readFileSync(f.executable,'utf8');
 code=code.replace("if(stage!=='planning')result.planUpdates=", "if(stage!=='planning'&&JSON.stringify(schema.properties.planUpdates.items.properties.id.enum)!==JSON.stringify(['work']))throw new Error('STEWARD_ITEM_SCHEMA_REQUIRED');if(stage!=='planning')result.planUpdates=");
 writeFileSync(f.executable,code);const r=f.run();assert.equal(r.status,0,r.stderr);
 writeFileSync(f.executable,code.replace("id:'work',status:'completed'","id:'final-verification',status:'completed'"));
 const bad=f.run();assert.equal(bad.status,1);assert.match(bad.stderr,/Unknown checklist item/);
});

test('planning prompt states activity membership and host diagnoses omitted selection',t=>{
 const f=planned(t);let code=readFileSync(f.executable,'utf8');
 code=code.replace("if(stage==='planning')result.plan=", "if(stage==='planning'&&!prompt.includes('Every checklist item activity must also appear in plan.activities'))throw new Error('ACTIVITY_MEMBERSHIP_REQUIRED');if(stage==='planning')result.plan=");
 code=code.replace("items:[{id:'work',activity:'implementation'", "items:[{id:'work',activity:'research'");
 writeFileSync(f.executable,code);const r=f.run();assert.equal(r.status,1);assert.match(r.stderr,/Checklist item work activity research is absent from plan.activities/);
});
