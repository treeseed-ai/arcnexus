import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
export async function checkSummary(workspace=process.cwd()) {
 const {markdownReport}=await import(pathToFileURL(join(workspace,'dist/report.js')).href);
 const record={id:'independent-summary',status:'completed',outcome:'ready_for_integration',objective:'Bounded change',workspace:'/candidate',base:'abc',commands:[],changes:[],activities:[{at:'2026-10-31T00:00:00Z',turn:1,activity:'documentation',status:'completed',detail:{claim:{summary:'Documented boundary'}}},{at:'2026-10-31T00:00:01Z',turn:2,activity:'implementation',status:'completed',detail:{claim:{summary:'Implemented boundary'}}}],implementationAttempts:1};
 const before=JSON.stringify(record),result=markdownReport(record);
 assert.match(result,/^## Outcome$/m,'OUTCOME_SECTION_REQUIRED');
 assert.match(result,/ready_for_integration/,'VERIFIED_OUTCOME_REQUIRED');
 assert.match(result,/^## Activities$/m,'ACTIVITY_SECTION_REQUIRED');
 assert.match(result,/documentation/);assert.match(result,/implementation/);assert.match(result,/completed/);
 assert.equal(JSON.stringify(record),before,'Renderer must not mutate evidence');
 const historical=markdownReport({id:'historical',status:'prepared',workspace:'/old',base:'base',commands:[]});
 assert.match(historical,/historical/);assert.doesNotMatch(historical,/undefined|null/);
 console.log('Independent activity/outcome summary acceptance passed');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await checkSummary();
