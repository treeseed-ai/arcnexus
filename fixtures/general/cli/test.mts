import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from './index.mjs';

/** Establishes the existing cli-owned behavior before candidate changes. */
class CliScenarios {
  /** Observes the current public API and its preserved output. */
  existing(): void {
    assert.equal(run([]), 'Hello, world!');
    assert.equal(run(['Ada']), 'Hello, Ada!');
  }
}

const scenarios = new CliScenarios();

test('cli preserves its existing public contract', () => scenarios.existing());
