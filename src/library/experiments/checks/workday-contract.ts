import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Independently checks workday contract against retained candidate evidence. */
class WorkdayContractAcceptance {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const { formatIdentity } = await import(pathToFileURL(resolve('identity/index.mjs')).href);
    const { displayIdentity } = await import(pathToFileURL(resolve('gateway/index.mjs')).href);
    for (const id of ['Ada', '', 'Renée']) {
      assert.equal(formatIdentity(id).id, id);
      assert.equal(formatIdentity(id).label, 'Identity: ' + id);
      assert.equal(displayIdentity(id), 'Identity: ' + id);
    }
  }
}

await new WorkdayContractAcceptance().run();
