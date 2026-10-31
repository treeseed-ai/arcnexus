import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usageDelta} from '../../dist/attempts.js';
test('missing, incomplete or decreasing cumulative counters are unavailable',()=>{
 assert.equal(usageDelta({input_tokens:10},undefined),null);
 assert.equal(usageDelta({input_tokens:10},{input_tokens:8}),null);
 assert.equal(usageDelta({input_tokens:10,output_tokens:3},{input_tokens:12}),null);
 assert.equal(usageDelta(null,{input_tokens:NaN}),null);
 assert.deepEqual(usageDelta(null,{input_tokens:10}),{input_tokens:10});
 assert.deepEqual(usageDelta({input_tokens:10},{input_tokens:12}),{input_tokens:2});
});
