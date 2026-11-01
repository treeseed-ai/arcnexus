import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Independently checks expiration against retained candidate evidence. */
class ExpirationAcceptance {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(target: string): Promise<void> {
    const { normalizeIdentity, isSessionExpired } = await import(
      pathToFileURL(join(resolve(target), 'src/identity.mjs')).href
    );
    assert.equal(normalizeIdentity(' Ada '), 'ada');
    assert.equal(typeof isSessionExpired, 'function', 'isSessionExpired must be exported');
    for (const expiry of [-100, 0, 100, 1700000000000]) {
      assert.equal(isSessionExpired(expiry, expiry - 1), false);
      assert.equal(isSessionExpired(expiry, expiry), true);
      assert.equal(isSessionExpired(expiry, expiry + 1), true);
    }
    console.log('Independent expiration acceptance passed');
  }
}

await new ExpirationAcceptance().run(process.argv[2] ?? '');
