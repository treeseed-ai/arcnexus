import assert from 'node:assert/strict';
import { displayIdentity } from './index.mjs';

/** Owns gateway contract test behavior and its component collaborators. */
class GatewayContractTest {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(): void {
    assert.equal(typeof displayIdentity('Ada'), 'string');
  }
}

new GatewayContractTest().run();
