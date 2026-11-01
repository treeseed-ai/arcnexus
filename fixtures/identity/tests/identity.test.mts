import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentity } from '../src/identity.mjs';
class IdentityTests {
  normalization(): void {
    assert.equal(normalizeIdentity(' Ada '), 'ada');
  }
}
const suite = new IdentityTests();
test('identity normalization trims and lowercases', () => suite.normalization());
