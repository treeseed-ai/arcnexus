import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const [path,scenario]=process.argv.slice(2),r=JSON.parse(readFileSync(path));
assert.equal(r.evidenceMode,'simulation');
if(scenario==='boundary'){assert.equal(r.outcome,'blocked');assert.equal(r.requests[0].ownerId,'dependency');assert.equal(r.changes.length,0);}
else{assert.equal(r.outcome,'ready_for_integration');assert.equal(readFileSync(r.workspace+'/source.txt','utf8'),'after');assert.ok(r.operations.some(o=>o.exitCode===0));if(scenario==='repair'){assert.equal(r.implementationAttempts,2);assert.ok(r.commands.some(c=>c.exitCode===1));}}
console.log('SIMULATED acceptance '+scenario);
