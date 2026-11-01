import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeName } from './index.mjs';

/** Establishes the existing names-owned behavior before candidate changes. */
class NamesScenarios {
  /** Observes the current public API and its preserved output. */
  existing(): void {
    assert.equal(normalizeName(' Ada '), 'Ada');
  }
}

const scenarios = new NamesScenarios();

test('names preserves its existing public contract', () => scenarios.existing());
