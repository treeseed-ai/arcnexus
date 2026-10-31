import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const target = resolve(process.argv[2] ?? '');
const { normalizeIdentity, isSessionExpired } = await import(pathToFileURL(join(target, 'src/identity.mjs')).href);
assert.equal(normalizeIdentity(' Ada '), 'ada');
assert.equal(typeof isSessionExpired, 'function', 'isSessionExpired must be exported');
for (const expiry of [-100, 0, 100, 1700000000000]) {
  assert.equal(isSessionExpired(expiry, expiry - 1), false);
  assert.equal(isSessionExpired(expiry, expiry), true);
  assert.equal(isSessionExpired(expiry, expiry + 1), true);
}
console.log('Independent expiration acceptance passed');
