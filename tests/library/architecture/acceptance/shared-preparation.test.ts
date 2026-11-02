import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ComponentV5Fixture } from '../support/component-v5-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises shared setup operations through actual workspace preparation and installed confinement. */
class SharedPreparationScenarios {
  /** Resolves setup automatically, writes generated evidence, and preserves maintained source. */
  prepare(t: TestContext): void {
    const f = this.fixture(t);
    const { result, report, state } = this.execute(f, t);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(report.workspace, 'package/generated/proof'), 'utf8'), 'sample');
    assert.equal(
      readFileSync(join(report.workspace, 'package/src/value.ts'), 'utf8'),
      'export const value = 1;',
    );
    assert.equal(report.operationInvocations.length, 1);
    assert.equal(report.operationInvocations[0].purpose, 'setup');
    assert.equal(report.operationInvocations[0].operationId, 'prepare');
    const cleanup = spawnSync(process.execPath, [resolve('dist/cli.js'), 'cleanup', report.id], {
      encoding: 'utf8',
      env: { ...process.env, ARCNEXUS_STATE_DIR: state },
    });
    assert.equal(cleanup.status, 0, cleanup.stderr);
  }

  /** Identical inherited setup is executed once even when several owners are eligible. */
  deduplicates(t: TestContext): void {
    const f = this.fixture(t);
    f.put(
      'architecture/components/second.json',
      f.component('second', 'library', {
        parentId: 'package',
        owns: ['second'],
      }),
    );
    f.put('architecture/operations/prepare.json', {
      ...this.operation(),
      args: ['package/src/prepare.cjs', 'shared'],
    });
    f.commit();
    const { result, report } = this.execute(f, t);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.operationInvocations.length, 1);
    assert.equal(readFileSync(join(report.workspace, 'package/generated/proof'), 'utf8'), 'shared');
  }

  /** Setup scripts cannot mutate maintained files before any after-the-fact scope inspection. */
  denies(t: TestContext): void {
    const f = this.fixture(t);
    f.put(
      'package/src/prepare.cjs',
      "require('fs').writeFileSync('package/src/value.ts','unauthorized');",
    );
    f.commit();
    const { result, report } = this.execute(f, t);
    assert.equal(result.status, 1);
    assert.equal(
      readFileSync(join(report.workspace, 'package/src/value.ts'), 'utf8'),
      'export const value = 1;',
    );
    assert.match(
      readFileSync(report.operationInvocations[0].result.log, 'utf8'),
      /EROFS|EACCES|EPERM/,
    );
  }

  /** Obsolete execution budgets are rejected before any setup operation can run. */
  budget(t: TestContext): void {
    const f = this.fixture(t);
    f.put('architecture/execution-profiles/luna.json', {
      schemaVersion: 3,
      id: 'luna',
      model: 'configured-model',
      reasoning: 'medium',
      webSearch: 'disabled',
      operationCategories: ['unit-test'],
      maxTurns: 1,
    });
    f.commit();
    const { result } = this.execute(f, t);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Remove obsolete work budget maxTurns/);
  }

  /** Uses private fixture evidence and returns the persisted report even when setup fails. */
  private execute(f: ComponentV5Fixture, t: TestContext) {
    const state = f.root + '-state';
    t.after(() => rmSync(state, { recursive: true, force: true }));
    const result = spawnSync(
      process.execPath,
      [
        resolve('dist/cli.js'),
        'prepare',
        '--project',
        join(f.root, 'package'),
        '--bindings',
        join(f.root, '.git/bindings.json'),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, ARCNEXUS_STATE_DIR: state },
      },
    );
    const id = readdirSync(join(state, 'runs'))[0]!;
    const report = id
      ? JSON.parse(readFileSync(join(state, 'runs', id, 'report.json'), 'utf8'))
      : undefined;
    return { result, report, state };
  }

  /** Captures a minimal package with one shared setup definition and no environment commands. */
  private fixture(t: TestContext): ComponentV5Fixture {
    const f = new ComponentV5Fixture(t);
    f.git('remote', 'add', 'origin', 'https://example.invalid/sample.git');
    f.put('architecture/environment.json', {
      schemaVersion: 4,
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    });
    this.components(f);
    f.put('package/.gitignore', 'generated/\n');
    f.put(
      'package/src/prepare.cjs',
      "require('fs').writeFileSync('package/generated/proof',process.argv[2]);",
    );
    f.put('architecture/operations/prepare.json', this.operation());
    f.put('.git/bindings.json', {
      schemaVersion: 1,
      repositories: {},
      tools: { codex: process.env.ARCNEXUS_TEST_CODEX! },
    });
    f.commit();
    return f;
  }

  /** Gives package inheritance, source ownership and shared definitions distinct declarations. */
  private components(f: ComponentV5Fixture): void {
    f.put(
      'architecture/components/package.json',
      f.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
        operations: { prepare: ['setup'] },
      }),
    );
    f.put(
      'architecture/components/operations.json',
      f.component('operations', 'library', {
        parentId: 'maintenance-package',
        owns: ['architecture/operations'],
      }),
    );
    f.put(
      'architecture/components/unrelated-filename.json',
      f.component('sample', 'library', {
        parentId: 'package',
        owns: ['src', 'docs', 'tests', '.gitignore'],
      }),
    );
  }

  /** Declares generated output and command context in one executable definition. */
  private operation() {
    return {
      schemaVersion: 4,
      id: 'prepare',
      purpose: 'Prepare outputs',
      repository: 'sample',
      kind: 'command',
      command: 'node',
      args: ['package/src/prepare.cjs', { context: 'ownerId' }],
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      generatedDirectories: ['package/generated'],
      artifacts: ['package/generated/proof'],
    };
  }
}

const scenarios = new SharedPreparationScenarios();

test(
  'minimal package prepares through captured shared operations',
  { skip: !process.env.ARCNEXUS_TEST_CODEX && 'Requires installed confinement' },
  (t) => scenarios.prepare(t),
);

test(
  'shared preparation deduplicates inherited resolved operations',
  { skip: !process.env.ARCNEXUS_TEST_CODEX && 'Requires installed confinement' },
  (t) => scenarios.deduplicates(t),
);

test(
  'shared preparation denies setup-script source mutation',
  { skip: !process.env.ARCNEXUS_TEST_CODEX && 'Requires installed confinement' },
  (t) => scenarios.denies(t),
);

test('shared preparation rejects obsolete profile budgets', (t) => scenarios.budget(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['live'] });
