import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digest } from './assignment.js';
import { changes, checkScope } from './changes.js';
import { covered, type Component } from './components.js';
import type { AgentResult } from './codex.js';
import type { RecordData } from './state.js';
import { git } from './process.js';
export interface FrozenTest {path:string;content:string;sha256:string}
export function specificationFiles(record:RecordData,component:Component,documentationOnly:boolean,selected=changes(record)):FrozenTest[]{
 const observed=selected;checkScope(record.workspace,observed,documentationOnly?component.documentation:[...component.documentation,...component.tests]);
 if(!observed.some(c=>covered(c.path,component.documentation)))throw new Error('Specification must document changed intent');
 if(documentationOnly)return [];
 const tests=observed.filter(c=>covered(c.path,component.tests));
 if(!tests.length)throw new Error('Specification must add or update regression tests');
 return tests.map(c=>{if(c.kind==='D')throw new Error('Regression checkpoint cannot delete tests');const content=readFileSync(join(record.workspace,c.path));return {path:c.path,content:content.toString('base64'),sha256:digest(content)};});
}
export async function withFrozenTests(record:RecordData,tests:FrozenTest[],check:()=>Promise<void>):Promise<void>{
 checkScope(record.workspace,tests.map(t=>({path:t.path,kind:'M'})),tests.map(t=>t.path));
 const saved=tests.map(t=>{const path=join(record.workspace,t.path);return {path,content:existsSync(path)?readFileSync(path):null};});
 try {
  for(const test of tests){const bytes=Buffer.from(test.content,'base64');if(digest(bytes)!==test.sha256)throw new Error('Frozen regression digest mismatch');const path=join(record.workspace,test.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
  await check();
  for(const test of tests)if(digest(readFileSync(join(record.workspace,test.path)))!==test.sha256)throw new Error('Verification altered frozen regression');
 }finally{checkScope(record.workspace,tests.map(t=>({path:t.path,kind:'M'})),tests.map(t=>t.path));for(const file of saved){if(file.content===null){if(existsSync(file.path))unlinkSync(file.path);}else writeFileSync(file.path,file.content);}}
}
export function candidateDigest(record:RecordData):string {
 const observed=changes(record);checkScope(record.workspace,observed,observed.map(c=>c.path));
 return digest(JSON.stringify({index:git(record.workspace,'diff','--cached','--binary',record.base,'--'),working:git(record.workspace,'diff','--binary','--',),files:observed.map(c=>({path:c.path,bytes:existsSync(join(record.workspace,c.path))?readFileSync(join(record.workspace,c.path)).toString('base64'):null}))}));
}
export function validateRequests(result:AgentResult,componentId:string,owners:string[],allowUnknownOwner=false):void{
 for(const request of result.requests){
  if(request.fromComponent!==componentId)throw new Error('Boundary request has wrong requesting component');
  if(!allowUnknownOwner&&request.ownerId!==null&&!owners.includes(request.ownerId))throw new Error(`Unknown boundary owner: ${request.ownerId}; use null for an architectural question`);
 }
 if(result.requests.length && result.status!=='blocked')throw new Error('Unresolved boundary requests must report blocked');
 if(result.status==='blocked'&&!result.blockers.length)throw new Error('Blocked result requires a reason');
}
