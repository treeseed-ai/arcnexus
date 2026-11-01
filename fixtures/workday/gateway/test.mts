import assert from 'node:assert/strict';
import { displayIdentity } from './index.mjs';
class GatewayContractTest {
  run(): void {
    assert.equal(typeof displayIdentity('Ada'), 'string');
  }
}
new GatewayContractTest().run();
