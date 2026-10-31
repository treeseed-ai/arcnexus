import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {formatIdentity}=await import(pathToFileURL(resolve('identity/index.mjs')));
const {displayIdentity}=await import(pathToFileURL(resolve('gateway/index.mjs')));
for(const id of ['Ada','','Renée']) {assert.equal(formatIdentity(id).id,id);assert.equal(formatIdentity(id).label,'Identity: '+id);assert.equal(displayIdentity(id),'Identity: '+id);}
