import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentity } from '../src/identity.mjs';
test('identity normalization trims and lowercases', () => {
  assert.equal(normalizeIdentity(' Ada '), 'ada');
});
