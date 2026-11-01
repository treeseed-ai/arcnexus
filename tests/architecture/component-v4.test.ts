import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { catalogFixture } from '../development-tooling/catalog-fixture.js';

class ComponentV4Fixture {
  readonly root = mkdtempSync(join(tmpdir(), 'component-v4-'));

  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    catalogFixture(this.root);
    this.put('architecture/environment.json', {
      schemaVersion: 1,
      prerequisites: [],
      setup: [],
      generatedDirectories: [],
    });
    this.hierarchy();
    this.put('package/src/value.ts', 'export const value = 1;');
    this.commit();
  }

  private hierarchy(): void {
    this.put(
      'architecture/components/platform.json',
      this.component('platform', 'platform', {
        initialization: { schemaVersion: 3, componentId: 'sample' },
        coverageExclusions: [
          { path: 'architecture', reason: 'Fixture catalog outside implementation' },
        ],
      }),
    );
    this.put(
      'architecture/components/package.json',
      this.component('package', 'package', {
        parentId: 'platform',
        repository: 'sample',
        repositoryRoot: 'package',
      }),
    );
    this.put(
      'architecture/components/sample.json',
      this.component('sample', 'library', {
        parentId: 'package',
        ownership: { paths: ['src'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['src'] },
        discovery: { source: ['src'], documentation: [], tests: [], exclude: [] },
      }),
    );
  }

  references(): any {
    const component = this.component('sample', 'library', {
      parentId: 'package',
      ownership: { paths: ['src'], publicModules: [], directoryExceptions: [] },
      access: { readPaths: ['.'], writeDirectories: ['src'] },
      patternIds: ['standard'],
      provides: [
        {
          id: 'value',
          version: '1',
          kind: 'typescript',
          path: 'src/value.ts',
          compatibility: 'Preserve value export',
        },
      ],
      consumes: [{ id: 'value', version: '1' }],
    });
    this.put('architecture/components/sample.json', component);
    this.pattern();
    this.put('package/src/standard.md', 'Export immutable values.');
    return component;
  }

  private pattern(): void {
    this.put('architecture/patterns/standard.yaml', {
      schemaVersion: 1,
      id: 'standard',
      owner: 'sample',
      purpose: 'Use standard exports',
      applicability: 'Value modules',
      document: 'src/standard.md',
      examples: [],
      operationIds: [],
    });
  }

  component(id: string, type: string, extra: object): any {
    return {
      schemaVersion: 4,
      id,
      type,
      purpose: 'Own bounded behavior',
      path: '.',
      objectives: [],
      constraints: [],
      questions: [],
      interfaces: [],
      relatedIds: [],
      role: 'engineer',
      executionProfile: 'luna',
      verification: [{ command: 'node', args: ['--version'] }],
      patternIds: [],
      access: { readPaths: ['.'], writeDirectories: [] },
      ...extra,
    };
  }

  put(path: string, value: unknown): void {
    mkdirSync(join(this.root, path, '..'), { recursive: true });
    writeFileSync(join(this.root, path), typeof value === 'string' ? value : JSON.stringify(value));
  }

  git(...args: string[]): void {
    const result = spawnSync('git', ['-C', this.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }

  commit(): void {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  }

  run(...args: string[]) {
    return spawnSync(process.execPath, [resolve('dist/cli.js'), ...args, '--project', this.root], {
      encoding: 'utf8',
    });
  }
}

class ComponentV4Tests {
  resolvesPackageAndDiscoversFiles(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const result = f.run('inspect', 'sample', 'Inspect responsibility', '--json');
    assert.equal(result.status, 0, result.stderr);
    const component = JSON.parse(result.stdout).context.at(-1);
    assert.equal(component.repository, 'sample');
    assert.deepEqual(component.allowedWritePaths, ['package/src']);
    assert.equal(component.inventory[0].path, 'package/src/value.ts');
    assert.match(component.inventory[0].sha256, /^[a-f0-9]{64}$/);
  }

  capturesStandardsAndRejectsMissingReferences(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const component = f.references();
    f.commit();
    const result = f.run('inspect', 'sample', 'Inspect references', '--json');
    assert.equal(result.status, 0, result.stderr);
    const resolved = JSON.parse(result.stdout).context.at(-1);
    assert.equal(resolved.patternSnapshots[0].artifacts[0].text, 'Export immutable values.');
    assert.equal(resolved.contractSnapshots[0].owner, 'sample');
    component.consumes[0].version = '2';
    f.put('architecture/components/sample.json', component);
    f.commit();
    assert.match(f.run('validate').stderr, /incompatible contract/);
  }

  rejectsUnownedTrackedFiles(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    f.put('orphan.txt', 'unowned');
    f.commit();
    const result = f.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /orphan.txt.*owner/);
  }
}

const suite = new ComponentV4Tests();
test('v4 derives repository and scope and discovers captured files', (t) =>
  suite.resolvesPackageAndDiscoversFiles(t));
test('v4 detects files outside every ownership root', (t) => suite.rejectsUnownedTrackedFiles(t));

test('v4 captures referenced standards and contract versions', (t) =>
  suite.capturesStandardsAndRejectsMissingReferences(t));
