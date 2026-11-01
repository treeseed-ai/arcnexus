import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usageDelta } from '../../../../dist/library/assignment/attempts.js';

/** Exercises attempts behavior through observable scenarios. */
class AttemptsTests {
  /** Verifies that missing incomplete or decreasing cumulative counters are unavailable. */
  missingIncompleteOrDecreasingCumulativeCountersAreUnavailable() {
    assert.equal(usageDelta({ input_tokens: 10 }, undefined), null);
    assert.equal(usageDelta({ input_tokens: 10 }, { input_tokens: 8 }), null);
    assert.equal(usageDelta({ input_tokens: 10, output_tokens: 3 }, { input_tokens: 12 }), null);
    assert.equal(usageDelta(null, { input_tokens: NaN }), null);
    assert.deepEqual(usageDelta(null, { input_tokens: 10 }), { input_tokens: 10 });
    assert.deepEqual(usageDelta({ input_tokens: 10 }, { input_tokens: 12 }), { input_tokens: 2 });
  }
}

const suite = new AttemptsTests();

test('missing, incomplete or decreasing cumulative counters are unavailable', () =>
  suite.missingIncompleteOrDecreasingCumulativeCountersAreUnavailable());

registerSuite({ component: 'assignment', level: 'unit', tags: ['deterministic'] });
