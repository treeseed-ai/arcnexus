import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises shared operation planning through the assembled catalog loader. */
class SharedOperationScenarios {
  /** Resolves one command for different owners without dropping mandatory ancestor usages. */
  shared(t: TestContext): void {
    const fixture = this.fixture(t);
    fixture.put(
      'architecture/components/second.json',
      fixture.component('second', 'library', {
        parentId: 'package',
        owns: ['second'],
        operations: {},
      }),
    );
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 0, result.stderr);
    const owners = JSON.parse(result.stdout).owners;
    assert.deepEqual(owners.sample.operationPlan.verify[0].args, [
      'sample',
      'package',
      'package/src',
      'package/docs',
      'package/tests',
      'architecture/components/unrelated-filename.json',
    ]);
    assert.equal(owners.second.operationPlan.verify[0].args[0], 'second');
    assert.equal(owners.second.operationPlan.verify[0].id, 'check');
    assert.equal(
      owners.sample.operationPlan.agent[0].definitionDigest,
      owners.second.operationPlan.agent[0].definitionDigest,
    );
  }

  /** Rejects a dependency cycle before building a partially executable checkpoint. */
  cycle(t: TestContext): void {
    const fixture = this.fixture(t);
    fixture.put('architecture/operations/check.json', this.operation(['other']));
    fixture.put('architecture/operations/other.json', {
      ...this.operation(['check']),
      id: 'other',
    });
    fixture.commit();
    const result = fixture.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /prerequisite cycle/);
  }

  /** Refuses indefinite service startup as a mandatory verification operation. */
  service(t: TestContext): void {
    const fixture = this.fixture(t);
    fixture.put('architecture/operations/check.json', {
      ...this.operation(),
      kind: 'service',
      service: { port: 0, readinessPath: '/', expectedStatus: 200 },
    });
    fixture.commit();
    assert.match(fixture.run('validate').stderr, /finite/);
  }

  /** Owns shared definitions explicitly and declares operation usages once at the package. */
  private fixture(t: TestContext): ComponentV5Fixture {
    const fixture = new ComponentV5Fixture(t);
    fixture.put(
      'architecture/components/operation-owner.json',
      fixture.component('operation-owner', 'library', {
        parentId: 'maintenance-package',
        owns: ['architecture/operations'],
      }),
    );
    fixture.put(
      'architecture/components/package.json',
      fixture.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        operations: { check: ['verify', 'agent'] },
      }),
    );
    fixture.put('architecture/operations/check.json', this.operation());
    return fixture;
  }

  /** Defines a literal command with only fixed host context tokens. */
  private operation(prerequisites: string[] = []) {
    return {
      schemaVersion: 4,
      id: 'check',
      purpose: 'Check captured owner',
      repository: 'sample',
      kind: 'command',
      command: 'node',
      args: [{ context: 'ownerId' }, { context: 'packageRoot' }, { context: 'ownedPaths' }],
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      prerequisites,
      generatedDirectories: [],
      artifacts: [],
    };
  }
}

const scenarios = new SharedOperationScenarios();

test('v5 shares command definitions and retains inherited verification', (t) =>
  scenarios.shared(t));

test('v5 operation planning rejects prerequisite cycles', (t) => scenarios.cycle(t));

test('v5 mandatory operation usages require finite actions', (t) => scenarios.service(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
