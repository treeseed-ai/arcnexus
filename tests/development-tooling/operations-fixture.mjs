import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {workflowFixture,cli} from "./workflow-fixture.mjs";
import {spawnSync} from 'node:child_process';
export function operationFixture(t,mode='success'){
 const f=workflowFixture(t,mode),profilePath=join(f.repo,'architecture/execution-profiles/luna.yaml');const profile=JSON.parse(readFileSync(profilePath));Object.assign(profile,{schemaVersion:2,maxTurns:4,operationCategories:['unit-test'],maxOperationCalls:mode==='budget'?1:24});writeFileSync(profilePath,JSON.stringify(profile));
 Object.assign(f.component,{schemaVersion:2,operationIds:['test']});writeFileSync(join(f.repo,'architecture/components/sample.json'),JSON.stringify(f.component));
 mkdirSync(join(f.repo,'architecture/operations'));writeFileSync(join(f.repo,'architecture/operations/test.json'),JSON.stringify({schemaVersion:2,id:'test',purpose:'Observe regression',kind:'command',repository:'sample',cwd:'.',category:'unit-test',activities:['testing','implementation','review','research'],command:process.execPath,args:['verify.cjs'],timeoutSeconds:120,generatedDirectories:[],artifacts:[],probes:[]}));f.commit();
 let code=readFileSync(f.executable,'utf8').replace("process.stdin.on('end',()=>{","process.stdin.on('end',async()=>{").replace("const result={status:","const result={plan:null,planUpdates:[],status:");
 code=code.replace("if(stage==='specification'",`if(stage==='planning')result.plan={approach:'Verify change',assumptions:[],activities:[{activity:'implementation',reason:'Objective'}],items:[{id:'work',activity:'implementation',result:'Verified',criteria:[0],expectedEvidence:['test'],dependencies:[],status:'pending',evidence:[],explanation:''}],questions:[]};if(stage!=='planning')result.planUpdates=[{id:'work',status:'completed',explanation:'Observed',evidence:['source.txt']}];if(stage==='specification'`);
 code=code.replace("console.log(JSON.stringify({type:'item.completed'",`if(stage!=='planning'){
  const {Client}=await import(${JSON.stringify('file://'+resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'))});
  const {StdioClientTransport}=await import(${JSON.stringify('file://'+resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'))});
  if(!args.includes('mcp_servers.arcnexus.default_tools_approval_mode=\"approve\"'))throw new Error('EXPLICIT_BRIDGE_APPROVAL_MISSING');
  const option=name=>JSON.parse(args.find(a=>a.startsWith('mcp_servers.arcnexus.'+name+'=')).split('=').slice(1).join('='));
  const client=new Client({name:'controlled',version:'1'},{capabilities:{}});await client.connect(new StdioClientTransport({command:option('command'),args:option('args')}));
  const reply=await client.callTool({name:'operations.run',arguments:{id:${JSON.stringify(mode==='denied'?'unknown':'test')}}});
  fs.appendFileSync(${JSON.stringify(join(f.root,'operations.jsonl'))},JSON.stringify(reply)+'\\n');await client.close();
 }
 console.log(JSON.stringify({type:'item.completed'`);writeFileSync(f.executable,code);return f;
}
