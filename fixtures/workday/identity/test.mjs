import assert from 'node:assert/strict';
import {formatIdentity} from './index.mjs';
assert.equal(formatIdentity('Ada').id, 'Ada');
