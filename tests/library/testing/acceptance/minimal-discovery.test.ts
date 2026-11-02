import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { MinimalTestFixture } from '../support/minimal-test-fixture.js';

/** Exercises derived test selection through the built CLI without executing candidate modules. */
class MinimalDiscoveryScenarios {
  /** Keeps inspection available during migration while refusing the legacy unconfined execution path. */
  rejectsLegacyExecution(t: TestContext): void {
    const f = new MinimalTestFixture(t);
    const result = f.run('run', 'sample');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Migrate test profile to schemaVersion 2/);
  }

  /** Includes new owned suites and excludes classified documentation without per-leaf discovery. */
  selects(t: TestContext, root: string): void {
    const f = new MinimalTestFixture(t, root);
    const prefix = root === '.' ? '' : `${root}/`;
    f.put(
      `${prefix}tests/unit/new.test.ts`,
      "function registerSuite(x) {}\nregisterSuite({component:'sample',level:'unit'});",
    );
    f.put(`${prefix}tests/examples/example.test.ts`, 'Documentation, never a suite');
    const result = f.run('inspect', 'sample');
    assert.equal(result.status, 0, result.stderr);
    const selection = JSON.parse(result.stdout);
    assert.equal(selection.suites.length, 3);
    const added = selection.suites.find((suite: { source: string }) =>
      suite.source.endsWith('new.test.ts'),
    );
    assert.equal(added.source, `${prefix}tests/unit/new.test.ts`);
    assert.equal(added.compiled, '.test-build/unit/new.test.js');
    assert.equal(added.state, 'added');
    const all = f.run('inspect');
    assert.equal(all.status, 0, all.stderr);
    assert.equal(JSON.parse(all.stdout).suites.length, 3);
  }
}

const scenarios = new MinimalDiscoveryScenarios();

test('minimal components cannot run tests through legacy inline commands', (t) =>
  scenarios.rejectsLegacyExecution(t));

test('minimal ownership discovers captured and new suites without discovery declarations', (t) =>
  scenarios.selects(t, '.'));

test('minimal test discovery anchors package paths and inherited profile without container suites', (t) =>
  scenarios.selects(t, 'nested'));

registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
