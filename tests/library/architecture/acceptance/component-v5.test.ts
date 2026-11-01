import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Verifies minimal declarations through production catalog loading and ownership validation. */
class ComponentV5Scenarios {
  /** Resolves inherited policy, implicit definition ownership and revision-bound file classification. */
  minimal(t: TestContext): void {
    const f = new ComponentV5Fixture(t);
    const r = f.run('validate');
    assert.equal(r.status, 0, r.stderr);
    const owner = JSON.parse(r.stdout).owners.sample;
    assert.equal(owner.repository, 'sample');
    assert.equal(owner.packageRoot, 'package');
    assert.deepEqual(owner.ownedPaths, [
      'package/src',
      'package/docs',
      'package/tests',
      'architecture/components/unrelated-filename.json',
    ]);
    assert.deepEqual(owner.directoryGrants, []);
    assert.equal(
      owner.inventory.find((v: any) => v.path === 'package/docs/value.md').kind,
      'documentation',
    );
    assert.equal(
      owner.inventory.find((v: any) => v.path === 'package/tests/value.test.ts').kind,
      'tests',
    );
    assert.deepEqual(owner.policy.role, { value: 'engineer', source: 'platform' });
    assert.deepEqual(owner.publicModules, ['package/src/value.ts']);
  }

  /** Rejects obsolete authored fields rather than silently deriving around contradictory authority. */
  obsolete(t: TestContext, field: string): void {
    const f = new ComponentV5Fixture(t);
    f.put(
      'architecture/components/unrelated-filename.json',
      f.component('sample', 'library', {
        parentId: 'package',
        owns: ['src', 'docs', 'tests'],
        [field]: [],
      }),
    );
    f.commit();
    const result = f.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /additional|retired|unsupported/i);
  }

  /** Prevents a descendant from widening an explicit read boundary. */
  reads(t: TestContext): void {
    const f = new ComponentV5Fixture(t);
    f.put(
      'architecture/components/package.json',
      f.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        reads: ['src'],
      }),
    );
    f.put(
      'architecture/components/unrelated-filename.json',
      f.component('sample', 'library', {
        parentId: 'package',
        owns: ['src', 'docs', 'tests'],
        reads: ['.'],
      }),
    );
    f.commit();
    assert.match(f.run('validate').stderr, /read.*widen|widen.*read/i);
  }

  /** Finds both unowned existing files and ownership overlap before future files are created. */
  ownership(t: TestContext, overlap: boolean): void {
    const f = new ComponentV5Fixture(t);
    if (overlap)
      f.put(
        'architecture/components/other.json',
        f.component('other', 'library', {
          parentId: 'package',
          owns: ['src/future'],
        }),
      );
    else f.put('orphan.txt', 'Unowned');
    f.commit();
    assert.match(f.run('validate').stderr, overlap ? /Overlapping ownership/ : /orphan.txt.*owner/);
  }

  /** Captures only committed source and changes its file inventory after a new revision. */
  revision(t: TestContext): void {
    const f = new ComponentV5Fixture(t);
    f.put('package/docs/added.md', 'New document');
    const before = f.run('validate');
    assert.equal(before.status, 0, before.stderr);
    assert.equal(JSON.parse(before.stdout).owners.sample.inventory.length, 4);
    f.commit();
    const after = f.run('validate');
    assert.equal(after.status, 0, after.stderr);
    assert.equal(JSON.parse(after.stdout).owners.sample.inventory.length, 5);
  }
}

const scenarios = new ComponentV5Scenarios();

test('v5 derives minimal leaf policy, ownership and inventory', (t) => scenarios.minimal(t));

for (const field of ['path', 'discovery', 'verification', 'relatedIds', 'provides', 'operationIds'])
  test(`v5 rejects retired ${field} declarations`, (t) => scenarios.obsolete(t, field));

test('v5 rejects widened inherited read access', (t) => scenarios.reads(t));

test('v5 rejects unowned maintained files', (t) => scenarios.ownership(t, false));

test('v5 rejects overlapping future ownership', (t) => scenarios.ownership(t, true));

test('v5 inventory is pinned to committed authority', (t) => scenarios.revision(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
