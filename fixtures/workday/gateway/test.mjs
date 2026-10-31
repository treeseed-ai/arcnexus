import assert from 'node:assert/strict';
import {displayIdentity} from './index.mjs';
assert.equal(typeof displayIdentity('Ada'), 'string');
