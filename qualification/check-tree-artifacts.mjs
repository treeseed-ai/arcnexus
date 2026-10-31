import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const expected=JSON.parse(readFileSync(new URL('./tree-artifact-expected.json',import.meta.url),'utf8'));
const run=owner=>spawnSync('bun',['tests/support/assembly/artifact-inventory.mts',owner,'vendor/task3c/api.tgz'],{encoding:'utf8',timeout:30000});
const result=run('admin');assert.equal(result.status,0,result.stderr);
assert.deepEqual(JSON.parse(result.stdout),expected,'Sorted kinds and preserved archive identity/inventory required');
const invalid=run('unknown-owner');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/ARTIFACT_SELECTION_REQUIRED/);
console.log('Independent real-archive diagnostics acceptance passed');
