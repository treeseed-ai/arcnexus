import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { workflowFixture, cli } from "./workflow-fixture.mjs";
export function handoffFixture(t, mode = "implementation") {
  const f = workflowFixture(t);
  mkdirSync(join(f.repo, "dependency-docs"));
  mkdirSync(join(f.repo, "dependency-tests"));
  writeFileSync(join(f.repo, "dependency.txt"), "before");
  writeFileSync(join(f.repo, "dependency-docs/behavior.md"), "Before");
  writeFileSync(join(f.repo, "dependency-tests/.keep"), "");
  const definition = { ...f.component, schemaVersion: 2, operationIds: [] };
  writeFileSync(
    join(f.repo, "architecture/components/sample.json"),
    JSON.stringify(definition),
  );
  writeFileSync(
    join(f.repo, "architecture/components/dependency.json"),
    JSON.stringify({
      ...definition,
      id: "dependency",
      path: "dependency.txt",
      allowedWritePaths: [
        "dependency.txt",
        "dependency-docs",
        "dependency-tests",
      ],
      documentation: ["dependency-docs"],
      tests: ["dependency-tests"],
      verification: [{ command: "node", args: ["dependency-verify.cjs"] }],
    }),
  );
  writeFileSync(
    join(f.repo, "dependency-verify.cjs"),
    "if(require('fs').existsSync('dependency-tests/regression.cjs'))require('./dependency-tests/regression.cjs')",
  );
  const profile = JSON.parse(
    readFileSync(join(f.repo, "architecture/execution-profiles/luna.json")),
  );
  Object.assign(profile, {
    schemaVersion: 2,
    maxTurns: 4,
    operationCategories: [],
    maxOperationCalls: 24,
  });
  writeFileSync(
    join(f.repo, "architecture/execution-profiles/luna.json"),
    JSON.stringify(profile),
  );
  if (mode === "refresh") {
    writeFileSync(
      join(f.repo, "refresh.cjs"),
      "const fs=require('fs');fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/value',fs.readFileSync('dependency.txt'));",
    );
    writeFileSync(
      join(f.repo, "architecture/environment.json"),
      JSON.stringify({
        schemaVersion: 1,
        prerequisites: [],
        setup: [{ command: "node", args: ["refresh.cjs"] }],
        generatedDirectories: ["generated"],
      }),
    );
  }
  f.commit();
  for (const owner of ["sample", "dependency"])
    writeFileSync(
      join(f.root, owner + ".json"),
      JSON.stringify({
        schemaVersion: 2,
        kind: "change",
        objective: owner + " contract change",
        expectedOutcome: "Verified contract",
        acceptanceCriteria: ["Implement contract"],
        hostChecks: [],
      }),
    );
  const check = join(f.root, "acceptance.cjs");
  writeFileSync(
    check,
    "const fs=require('fs');if(fs.readFileSync('source.txt','utf8')!=='uses:after'||fs.readFileSync('dependency.txt','utf8')!=='after'||fs.existsSync('new.txt'))process.exit(9)",
  );
  const manifest = join(f.root, "workday.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 1,
      requester: {
        component: "sample",
        assignment: "sample.json",
        refresh:
          mode === "refresh"
            ? [{ command: "node", args: ["refresh.cjs"] }]
            : [],
      },
      recipient: {
        component: "dependency",
        assignment: "dependency.json",
        refresh: [],
        maxAttempts: mode === "repair" ? 2 : 1,
      },
      dependency: {
        from: "sample",
        to: "dependency",
        contract: "sample-contract",
        delivery: "Verified dependency value",
      },
      acceptance: [
        {
          id: "combined",
          command: process.execPath,
          args: [check],
          artifacts: [check],
        },
      ],
    }),
  );
  writeFileSync(
    f.executable,
    `#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2),mode=${JSON.stringify(mode)};
if(a[0]==='--version'){console.log('controlled workday');process.exit(0)}if(a[0]==='sandbox')process.exit(0);
process.chdir(a[a.indexOf('--cd')+1]);let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',()=>{
 const owner=p.includes('active component identity sample as')?'sample':'dependency',stage=p.match(/Activity turn: ([a-z-]+)/)[1];
 const prior=fs.existsSync(${JSON.stringify(f.calls)})?fs.readFileSync(${JSON.stringify(f.calls)},'utf8').trim().split('\\n').map(JSON.parse):[];
 fs.appendFileSync(${JSON.stringify(f.calls)},JSON.stringify({owner,stage,args:a})+'\\n');
 const seen=prior.filter(x=>x.owner===owner&&x.stage===stage).length,n=prior.filter(x=>x.owner===owner).length+1;
 const r={status:'completed',summary:'Bounded workday result',blockers:[],findings:[],activities:[],regression:null,reviewFindings:[],requests:[],plan:null,planUpdates:[],coordination:null};
 const coord=(action,complete=false)=>({action,contract:'sample-contract',requestId:action==='request'?null:(p.match(/Current request ID: ([a-f0-9-]+)/)?.[1]??null),text:'Implement the declared dependency contract',activityComplete:complete});
 if(stage==='planning')r.plan={approach:'Bounded owner change',assumptions:[],activities:[{activity:'implementation',reason:'Implement owned behavior'}],items:[{id:'work',activity:'implementation',result:'Verified contract',criteria:[0],expectedEvidence:['host verification'],dependencies:[],status:'pending',explanation:'',evidence:[]}],questions:[]};
 const dep=owner==='dependency',docs=dep?'dependency-docs':'docs',tests=dep?'dependency-tests':'tests',file=dep?'dependency.txt':'source.txt',after=dep?'after':'uses:after';
 if(stage==='specification'){fs.writeFileSync(docs+'/behavior.md','Contract must be '+after);fs.writeFileSync(tests+'/regression.cjs',"if(require('fs').readFileSync("+JSON.stringify(file)+",'utf8')!=="+JSON.stringify(after)+")throw new Error('CONTRACT_EXPECTED');");r.regression={verificationIndex:0,exitCode:1,outputIncludes:'CONTRACT_EXPECTED'};}
 if(stage==='implementation'||stage==='correction')fs.writeFileSync(file,dep&&['repair','weak-test'].includes(mode)&&stage==='implementation'?'broken':after);
 if(mode==='weak-test'&&dep&&stage==='implementation')fs.writeFileSync(tests+'/regression.cjs','// weakened');
 if(mode==='refresh'&&!dep&&stage==='implementation'&&seen>0)fs.writeFileSync(file,'uses:'+fs.readFileSync('generated/value','utf8'));
 if(mode==='combined-failure'&&!dep&&stage==='implementation'&&seen>0)fs.writeFileSync('new.txt','regression');
 if(mode==='foreign-edit'&&!dep&&stage==='implementation'&&seen>0)fs.writeFileSync('dependency.txt','unauthorized');
 if(mode==='no-delivery'&&dep&&stage==='implementation'){r.status='blocked';r.blockers=['Unable to deliver'];}
 if(mode==='hang'&&dep&&stage==='implementation'){fs.writeFileSync(${JSON.stringify(join(f.root, "agent-pid"))},String(process.pid));setInterval(()=>{},1000);return;}
 if(stage==='review')r.planUpdates=[{id:'work',status:'completed',explanation:'Implemented and checked',evidence:[file]}];
 if(dep&&stage==='planning'){
  r.coordination=coord(mode==='reject'?'reject':(mode==='clarify'&&seen===0||mode==='exhaust-clarification')?'clarify':'accept',mode!=='exhaust-clarification'&&(mode!=='clarify'||seen>0));
  if(mode==='reject'){r.status='blocked';r.blockers=['Request rejected with evidence'];}
 }
 if(owner==='sample'&&stage==='coordination'){r.coordination=coord('answer',true);}
 const trigger=mode==='planning-updates'?'planning':mode==='completed-specification'?'specification':['planning','specification','review'].includes(mode)?mode:'implementation';
 if(owner==='sample'&&stage===trigger&&(seen===0||mode==='duplicate')){
  if(stage==='implementation')fs.writeFileSync(file,'partial');
  if(mode==='planning-updates')r.planUpdates=[{id:'work',status:'blocked',explanation:'Awaiting owner',evidence:[]}];
  r.status='blocked';r.blockers=['Requires dependency owner'];r.coordination=coord('request',mode==='completed-specification');r.requests=[{fromComponent:mode==='forged'?'dependency':'sample',ownerId:mode==='unknown-owner'?'unknown':'dependency',request:'Implement dependency value',evidence:['dependency.txt'],acceptanceCriteria:['Dependency becomes after'],reason:'Dependency is outside sample authority'}];
 }
 console.log(JSON.stringify({type:'thread.started',thread_id:owner+'-thread'}));console.log(JSON.stringify({type:'item.completed',item:{id:'result',type:'agent_message',text:JSON.stringify(r)}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:n*10,cached_input_tokens:0,output_tokens:n*2}}));
});`,
    { mode: 0o755 },
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [
        cli,
        "workday",
        "run",
        manifest,
        "--project",
        f.repo,
        "--codex-path",
        f.executable,
      ],
      { encoding: "utf8", env: f.env, timeout: 60000 },
    );
  return { ...f, manifest, workday: run };
}
