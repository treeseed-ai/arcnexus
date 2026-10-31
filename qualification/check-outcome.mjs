import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [path,kind]=process.argv.slice(2),record=JSON.parse(readFileSync(path,'utf8'));
assert.equal(record.settings.model,'gpt-6-luna');assert.equal(record.settings.reasoning,'medium');
assert.equal(record.usageComplete,true);assert.ok(record.turns.length>0);
if(kind==='boundary'){
 assert.equal(record.outcome,'blocked');assert.equal(record.changes.length,0);
 const request=record.requests.find(r=>r.ownerId==='sdk-contracts');assert.ok(request,'SDK contract owner must be named');
 assert.equal(request.fromComponent,'artifact-diagnostics');assert.ok(request.evidence.length&&request.acceptanceCriteria.length&&request.reason.length);
 assert.match(JSON.stringify(request),/schema|contract|interface/i);
}else if(kind==='research'||kind==='review'){
 assert.equal(record.outcome,kind+'_completed');assert.equal(record.changes.length,0);assert.equal(record.turns.length,1);
 assert.ok(record.agent.findings.length);assert.ok(record.agent.findings.every(f=>f.evidence.length>0));
 if(kind==='research')assert.match(JSON.stringify(record.agent.findings),/architecture/);
}else{
 assert.equal(record.outcome,'ready_for_integration');assert.ok(record.changes.length>0);
 assert.ok(record.commands.some(c=>c.exitCode!==0),'Expected red test must be recorded');
 if(kind==='repair'){
  assert.equal(record.implementationAttempts,2);assert.ok(record.turns.some(t=>t.activity==='correction'));
  const logs=record.commands.map(c=>readFileSync(c.log,'utf8'));
  assert.ok(logs.some(log=>log.includes('FAULT_INJECTED:')&&log.includes('VERIFIED_OUTCOME_REQUIRED')));
  assert.ok(logs.some(log=>log.includes('FAULT_REPAIR_OBSERVED:')&&log.includes('Independent activity/outcome summary acceptance passed')));
  assert.doesNotMatch(readFileSync(record.workspace+'/src/report/report.ts','utf8'),/INJECTED_WRONG_OUTCOME/);
 }
}
console.log('Independent '+kind+' outcome acceptance passed; findings still require caller review');
