import assert from 'node:assert/strict';
import { formatIdentity } from './index.mjs';
class IdentityContractTest {
  run(): void {
    assert.equal(formatIdentity('Ada').id, 'Ada');
  }
}
new IdentityContractTest().run();
