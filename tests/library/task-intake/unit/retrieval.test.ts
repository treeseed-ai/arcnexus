import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { OwnerRetrieval } from '../../../../dist/library/task-intake/retrieval.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Checks lexical selection across executable owner types without granting authority. */
class RetrievalTests {
  /** Verifies that task retrieval includes release owners with relevant responsibility. */
  includesRelease(): void {
    const owner: any = {
      id: 'release',
      type: 'release',
      purpose: 'Verify release distribution',
      interfaces: [],
      allowedWritePaths: ['.github/workflows'],
      relatedIds: [],
    };
    const matches = new OwnerRetrieval([owner]).select('Verify release distribution');
    assert.equal(matches[0]?.id, 'release');
    assert.ok(matches[0]!.reasons.some((reason) => reason.includes('release')));
  }
}

const suite = new RetrievalTests();

test('task retrieval includes release owners with relevant responsibility', () =>
  suite.includesRelease());

registerSuite({ component: 'task-intake', level: 'unit', tags: ['deterministic'] });
