import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as architecture from '../../../../dist/library/architecture/components.js';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Keeps proposed-file classification consistent with the revision-bound inventory. */
class ClassificationScenarios {
  /** Classifies files before creation, without granting unknown files specification status. */
  proposed(t: TestContext): void {
    const fixture = new ComponentV5Fixture(t);
    const catalog = architecture.loadCatalog(fixture.root, fixture.git('rev-parse', 'HEAD'));
    const classify = (architecture as any).classifyComponentPath;
    assert.equal(typeof classify, 'function', 'The host requires one captured path classifier');
    const owner = catalog.components.sample!;
    assert.equal(classify(owner, 'package/docs/future.mdx'), 'documentation');
    assert.equal(classify(owner, 'package/docs/future.rst'), 'documentation');
    assert.equal(classify(owner, 'package/tests/future.test.ts'), 'tests');
    assert.equal(classify(owner, 'package/src/unknown.data'), 'unknown');
    assert.throws(() => classify(owner, 'outside.md'), /outside component ownership/);
  }

  /** Rejects contradictory classifications before a future file makes the conflict observable. */
  conflicting(t: TestContext): void {
    const fixture = new ComponentV5Fixture(t);
    fixture.put(
      'architecture/components/package.json',
      fixture.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        classification: [
          { path: 'src/future', kind: 'documentation' },
          { path: 'src/future/nested', kind: 'tests' },
        ],
      }),
    );
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Conflicting file classifications/);
  }
}

const scenarios = new ClassificationScenarios();

test('v5 classifies proposed paths using captured rules', (t) => scenarios.proposed(t));

test('v5 rejects classification conflicts on future paths', (t) => scenarios.conflicting(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
