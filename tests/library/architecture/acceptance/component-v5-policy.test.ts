import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises type discrimination and inherited authority through the built catalog loader. */
class ComponentPolicyScenarios {
  /** Every executable type shares the same minimal ownership contract. */
  executable(t: TestContext, type: string): void {
    const fixture = new ComponentV5Fixture(t);
    fixture.put(
      'architecture/components/unrelated-filename.json',
      fixture.component('sample', type, {
        parentId: 'package',
        owns: ['src', 'docs', 'tests'],
      }),
    );
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 0, result.stderr);
  }

  /** Missing executable policies must not select a fallback model or role. */
  missing(t: TestContext, field: string): void {
    const fixture = new ComponentV5Fixture(t);
    const platform = fixture.component('platform', 'platform', {
      role: 'engineer',
      executionProfile: 'luna',
      reads: ['.'],
    });
    delete platform[field];
    fixture.put('architecture/components/platform.json', platform);
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Missing role\/execution profile/);
  }

  /** Containers cannot acquire write authority through fields intended only for executable owners. */
  container(t: TestContext): void {
    const fixture = new ComponentV5Fixture(t);
    fixture.put(
      'architecture/components/package.json',
      fixture.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        owns: ['.'],
      }),
    );
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /additional/);
  }

  /** Local paths cannot escape their declaring package before normalization. */
  traversal(t: TestContext): void {
    const fixture = new ComponentV5Fixture(t);
    fixture.put(
      'architecture/components/unrelated-filename.json',
      fixture.component('sample', 'library', {
        parentId: 'package',
        owns: ['../package'],
      }),
    );
    fixture.commit();
    assert.match(fixture.run('validate').stderr, /Invalid relative path/);
  }
}

const scenarios = new ComponentPolicyScenarios();

for (const type of ['foundation', 'gateway', 'library', 'release'])
  test(`v5 resolves minimal ${type}`, (t) => scenarios.executable(t, type));

for (const field of ['role', 'executionProfile'])
  test(`v5 requires inherited ${field}`, (t) => scenarios.missing(t, field));

test('v5 rejects container ownership', (t) => scenarios.container(t));

test('v5 rejects package-relative traversal', (t) => scenarios.traversal(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
