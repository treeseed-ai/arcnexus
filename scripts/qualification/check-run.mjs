import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [path,kind]=process.argv.slice(2),r=JSON.parse(readFileSync(path,'utf8'));
assert.equal(r.status,'completed');assert.equal(r.settings.model,'gpt-6-luna');assert.equal(r.settings.reasoning,'medium');
assert.ok(r.plan.items.every(i=>['completed','skipped'].includes(i.status)));assert.ok(r.plan.hostChecks.every(i=>i.status==='completed'));
assert.ok(r.turns.every(t=>t.threadId===r.threadId));assert.ok(r.turns.length<=(kind==='repair'?6:kind==='change'?4:2));
assert.ok(r.operations.some(o=>o.exitCode===0),'actual operation feedback required');
assert.ok(r.services.every(s=>s.status==='stopped'&&s.endpointClosed===true));
if(kind==='change'||kind==='repair'){assert.equal(r.outcome,'ready_for_integration');assert.ok(r.changes.some(c=>c.path==='src/report.ts'));assert.ok(r.regressionCheckpoint);assert.ok(r.commands.some(c=>c.exitCode!==0));}
else {assert.equal(r.changes.length,0);assert.ok(r.agent.findings.length);}
if(kind==='repair'){assert.equal(r.implementationAttempts,2);assert.ok(r.turns.some(t=>t.activity==='correction'));assert.ok(r.commands.some(c=>readFileSync(c.log,'utf8').includes('FAULT_INJECTED')));}
if(kind==='http')assert.ok(r.services.length>0);
if(kind==='history')assert.ok(r.resolvedAssignment.priorEvidence.length>0);
if(kind==='tree')assert.equal(r.members.length,2);
console.log('QUALIFIED_'+kind);
