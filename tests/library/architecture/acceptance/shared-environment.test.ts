import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises composition without duplicated executable recipes or disposable-output declarations. */
class SharedEnvironmentScenarios {
  /** Accepts repository identity alone and derives output permission from the shared operation. */
  minimal(t: TestContext): void {
    const fixture = this.fixture(t);
    const result = fixture.run('validate');
    assert.equal(result.status, 0, result.stderr);
    const op = JSON.parse(result.stdout).owners.sample.operationPlan.setup[0];
    assert.deepEqual(op.generatedDirectories, ['generated']);
  }

  /** Retired recipes fail visibly instead of being ignored beside operation references. */
  retired(t: TestContext): void {
    const fixture = this.fixture(t);
    fixture.put('architecture/environment.json', { ...this.environment(), setup: [] });
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /additional properties|setup/);
  }

  /** Gives the operation registry its own accountable maintenance component. */
  private fixture(t: TestContext): ComponentV5Fixture {
    const fixture = new ComponentV5Fixture(t);
    fixture.put('architecture/environment.json', this.environment());
    fixture.put(
      'architecture/components/operations.json',
      fixture.component('operations', 'library', {
        parentId: 'maintenance-package',
        owns: ['architecture/operations'],
      }),
    );
    fixture.put(
      'architecture/components/package.json',
      fixture.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        operations: { build: ['setup', 'refresh'] },
      }),
    );
    fixture.put('architecture/operations/build.json', this.operation());
    fixture.commit();
    return fixture;
  }

  /** Defines output authority only in the shared operation. */
  private operation() {
    return {
      schemaVersion: 4,
      id: 'build',
      purpose: 'Build captured source',
      repository: 'sample',
      kind: 'command',
      command: 'node',
      args: ['--version'],
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      generatedDirectories: ['generated'],
      artifacts: [],
    };
  }

  /** Keeps composition limited to repository membership and pinned dependency mounts. */
  private environment() {
    return {
      schemaVersion: 4,
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    };
  }
}

const scenarios = new SharedEnvironmentScenarios();

test('shared operation outputs need no duplicate environment recipes', (t) => scenarios.minimal(t));

test('new composition rejects retired executable recipes', (t) => scenarios.retired(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
