import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(r.status,'completed');assert.equal(r.assignments.length,2);
assert.equal(new Set(r.assignments.map(a=>a.threadId)).size,2);
assert.ok(r.messages.some(m=>m.kind==='request'));
assert.ok(r.messages.some(m=>m.payload.decision==='accepted'));
assert.ok(r.messages.some(m=>m.payload.decision==='delivered'));
assert.ok(r.events.some(e=>e.type==='assignment.resumed'));
assert.equal(r.parking.status,'restored');
for(const a of r.assignments){assert.equal(a.status,'completed');assert.ok(a.activeMs<=900000);assert.equal(a.callerInterventions.length,0);assert.ok(a.turns.every(t=>t.threadId===a.threadId));assert.ok((a.services??[]).every(s=>s.stoppedAt||s.status==='stopped'));}
