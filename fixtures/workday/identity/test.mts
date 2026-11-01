import assert from 'node:assert/strict';
import { formatIdentity } from './index.mjs';

/** Owns identity contract test behavior and its component collaborators. */
class IdentityContractTest {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(): void {
    assert.equal(formatIdentity('Ada').id, 'Ada');
  }
}

new IdentityContractTest().run();
