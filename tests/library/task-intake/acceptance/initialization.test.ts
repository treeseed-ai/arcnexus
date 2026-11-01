import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises initialization behavior through observable scenarios. */
class InitializationTests {
  /** Verifies that legacy run initializes exactly once with captured read-only Luna provenance. */
  legacyRun(t: TestContext): void {
    const fixture = workflowFixture(t);
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.initialization.result.status, 'ready');
    assert.equal(record.initialization.provenance, 'runtime-fallback');
    assert.equal(record.initialization.model, 'gpt-6-luna');
    assert.equal(record.initialization.reasoning, 'medium');
    assert.equal(record.initialization.turns, 1);
    assert.notEqual(record.initialization.threadId, record.threadId);
    assert.equal(record.implementationAttempts, 1);
  }

  /** Verifies that refuses invalid initialization. */
  refusesInvalidInitialization(t: TestContext, mode: string): void {
    const fixture = workflowFixture(t);
    fixture.configure({ initializerMode: mode });
    const result = fixture.run();
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(fixture.calls), false, 'No worker inference');
    const record = JSON.parse(result.stdout);
    assert.ok(record.initialization);
    assert.match(result.stderr, /initializer|initialization/i);
  }

  /** Verifies that initializer loop retains needs_attention without dispatching a worker. */
  loopNeedsAttention(t: TestContext): void {
    const fixture = workflowFixture(t);
    fixture.configure({ initializerMode: 'loop' });
    const result = fixture.run();
    assert.equal(result.status, 1, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.status, 'needs_attention');
    assert.equal(existsSync(fixture.calls), false);
    const child = JSON.parse(
      readFileSync(join(fixture.state, 'runs', record.initialization.runId, 'report.json'), 'utf8'),
    );
    assert.equal(child.status, 'needs_attention');
    assert.match(
      readFileSync(join(fixture.state, 'runs', child.id, 'events.jsonl'), 'utf8'),
      /Tool unavailable/,
    );
  }

  /** Verifies that initializer model override is independent of the worker. */
  modelOverride(t: TestContext): void {
    const fixture = workflowFixture(t);
    const result = fixture.run('--initializer-model', 'gpt-6-astra');
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.initialization.model, 'gpt-6-astra');
    assert.equal(record.resolvedAssignment.executionProfile.model, 'gpt-6-luna');
  }

  /** Verifies that declared read only container. */
  declaredReadOnlyContainer(t: TestContext): void {
    const fixture = workflowFixture(t);
    this.declarePlatform(fixture);
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.initialization.provenance, 'declared-component');
    assert.equal(record.initialization.componentId, 'sample');
    assert.equal(record.initialization.turns, 1);
  }

  /** Adds an explicit platform initializer and commits the captured fixture definition. */
  private declarePlatform(fixture: ReturnType<typeof workflowFixture>): void {
    writeFileSync(
      join(fixture.repo, 'architecture/components/platform.yaml'),
      JSON.stringify({
        ...fixture.component,
        schemaVersion: 3,
        id: 'platform',
        type: 'platform',
        path: '.',
        allowedWritePaths: [],
        access: { readPaths: ['.'], writeDirectories: [] },
        initialization: { schemaVersion: 3, componentId: 'sample' },
      }),
    );
    writeFileSync(
      join(fixture.repo, 'architecture/components/sample.json'),
      JSON.stringify({
        ...fixture.component,
        schemaVersion: 3,
        parentId: 'platform',
      }),
    );
    fixture.commit();
  }

  /** Verifies that version-three platform must declare its initializer component. */
  missingDeclaration(t: TestContext): void {
    const fixture = workflowFixture(t);
    writeFileSync(
      join(fixture.repo, 'architecture/components/platform.yaml'),
      JSON.stringify({
        ...fixture.component,
        schemaVersion: 3,
        id: 'platform',
        type: 'platform',
        path: '.',
        allowedWritePaths: [],
        access: { readPaths: ['.'], writeDirectories: [] },
      }),
    );
    fixture.commit();
    const result = spawnSync(process.execPath, [cli, 'validate', '--project', fixture.repo], {
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /initializer|initialization/i);
  }
}

const suite = new InitializationTests();

test('legacy run initializes exactly once with captured read-only Luna provenance', (t) =>
  suite.legacyRun(t));

test('version-three platform must declare its initializer component', (t) =>
  suite.missingDeclaration(t));

for (const mode of ['write', 'widen', 'question'])
  test('initializer stops downstream inference: ' + mode, (t) =>
    suite.refusesInvalidInitialization(t, mode),
  );

test('initializer model override is independent of the worker', (t) => suite.modelOverride(t));

test('declared initializer works beneath a version-three containment-only platform', (t) =>
  suite.declaredReadOnlyContainer(t));

test('initializer loop retains needs_attention without dispatching a worker', (t) =>
  suite.loopNeedsAttention(t));

registerSuite({ component: 'task-intake', level: 'acceptance', tags: ['deterministic'] });
