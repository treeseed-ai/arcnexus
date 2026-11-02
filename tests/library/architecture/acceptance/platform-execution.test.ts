import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { captureInitialization } from '../../../../dist/library/architecture/initialization.js';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises the platform as the only authored source of new execution defaults. */
class PlatformExecutionScenarios {
  /** Resolves prompt/workday defaults and director identity without a second execution file. */
  singleSource(t: TestContext): void {
    const fixture = this.fixture(t);
    const context = new ExecutionContext().resolve(join(fixture.root, 'package'));
    assert.equal(context.packageId, 'package');
    assert.equal(context.directorProfile, 'director');
    assert.equal(context.reviewerProfile, 'director');
    const snapshot = captureInitialization(context.catalog, context.catalog.components.sample!);
    assert.equal(snapshot.componentId, 'maintenance');
    assert.equal(snapshot.profile.id, 'director');
    assert.equal(snapshot.model, 'configured-director-model');
    assert.equal(snapshot.provenance, 'declared-component');
  }

  /** Rejects retired duplicate execution files rather than silently choosing one source. */
  duplicate(t: TestContext): void {
    const fixture = this.fixture(t);
    fixture.put('architecture/execution.json', {
      directorProfile: 'luna',
      reviewerProfile: 'luna',
    });
    fixture.put(
      'architecture/components/old-execution-owner.json',
      fixture.component('old-execution-owner', 'library', {
        parentId: 'maintenance-package',
        owns: ['architecture/execution.json'],
      }),
    );
    fixture.commit();
    assert.throws(
      () => new ExecutionContext().resolve(fixture.root),
      /Retired execution configuration/,
    );
  }

  /** Missing execution requirements never trigger implicit model or initializer selection. */
  missing(t: TestContext): void {
    const fixture = new ComponentV5Fixture(t);
    fixture.git('remote', 'add', 'origin', 'https://example.invalid/sample.git');
    assert.throws(() => new ExecutionContext().resolve(fixture.root), /director.*reviewer/i);
  }

  /** Supplies explicit director/reviewer profiles once on the platform and leaves the leaf minimal. */
  private fixture(t: TestContext): ComponentV5Fixture {
    const fixture = new ComponentV5Fixture(t);
    fixture.git('remote', 'add', 'origin', 'https://example.invalid/sample.git');
    fixture.put(
      'architecture/components/platform.json',
      fixture.component('platform', 'platform', {
        role: 'engineer',
        executionProfile: 'luna',
        reads: ['.'],
        director: { component: 'maintenance', profile: 'director' },
        reviewerProfile: 'director',
        defaultPackage: 'maintenance-package',
        verificationInputs: ['architecture'],
      }),
    );
    fixture.put('architecture/execution-profiles/director.json', {
      schemaVersion: 3,
      id: 'director',
      model: 'configured-director-model',
      reasoning: 'medium',
      webSearch: 'disabled',
      operationCategories: ['unit-test'],
    });
    fixture.commit();
    return fixture;
  }
}

const scenarios = new PlatformExecutionScenarios();

test('v5 execution resolves platform defaults and captured director profile', (t) =>
  scenarios.singleSource(t));

test('v5 execution rejects duplicate retired configuration', (t) => scenarios.duplicate(t));

test('v5 execution requires explicit director and reviewer configuration', (t) =>
  scenarios.missing(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
