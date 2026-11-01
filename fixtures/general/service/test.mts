import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greet } from './index.mjs';

/** Establishes the existing service-owned behavior before candidate changes. */
class ServiceScenarios {
  /** Observes the current public API and its preserved output. */
  existing(): void {
    assert.equal(greet(' Ada '), 'Hello, Ada!');
  }
}

const scenarios = new ServiceScenarios();

test('service preserves its existing public contract', () => scenarios.existing());
