import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentity } from '../src/identity.mjs';

/** Owns identity tests behavior and its component collaborators. */
class IdentityTests {
  /** Handles normalization within this component’s captured contract. */
  normalization(): void {
    assert.equal(normalizeIdentity(' Ada '), 'ada');
  }
}

const suite = new IdentityTests();

test('identity normalization trims and lowercases', () => suite.normalization());
