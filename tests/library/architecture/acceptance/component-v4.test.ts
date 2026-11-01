import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, symlinkSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { catalogFixture } from '../../testing/support/catalog-fixture.js';

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

  primaryRepository(): void {
    this.put('architecture/environment.json', {
      schemaVersion: 1,
      prerequisites: [],
      setup: [],
      generatedDirectories: [],
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    });
  }

  dependencyCatalog(dependency: ComponentV4Fixture): void {
    this.git('remote', 'add', 'origin', 'https://example.invalid/sample.git');
    dependency.git('remote', 'add', 'origin', 'https://example.invalid/other.git');
    this.put('architecture/environment.json', {
      schemaVersion: 1,
      prerequisites: [],
      setup: [],
      generatedDirectories: [],
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [
          {
            id: 'other',
            repository: 'https://example.invalid/other.git',
            commit: dependency.git('rev-parse', 'HEAD'),
            path: 'dependencies/other',
            prerequisites: [],
            setup: [],
            generatedDirectories: [],
          },
        ],
      },
    });
    this.put('architecture/bindings.json', {
      schemaVersion: 1,
      repositories: { other: dependency.root },
      tools: {},
    });
    this.otherOwner();
  }

  private otherOwner(): void {
    this.put(
      'architecture/components/other-package.json',
      this.component('other-package', 'package', {
        parentId: 'platform',
        repository: 'other',
        repositoryRoot: 'package',
      }),
    );
    this.put(
      'architecture/components/other.json',
      this.component('other', 'library', {
        parentId: 'other-package',
        ownership: { paths: ['src'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['src'] },
        provides: [
          {
            id: 'remote-value',
            version: '1',
            kind: 'typescript',
            path: 'src/value.ts',
            compatibility: 'Preserve exported value',
          },
        ],
      }),
    );
    this.consumer();
  }

  private consumer(): void {
    this.put(
      'architecture/components/sample.json',
      this.component('sample', 'library', {
        parentId: 'package',
        ownership: { paths: ['src'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['src'] },
        consumes: [{ id: 'remote-value', version: '1' }],
      }),
    );
  }

  importingOwner(specifier: string): void {
    this.put(
      'architecture/components/consumer.json',
      this.component('consumer', 'library', {
        parentId: 'package',
        ownership: { paths: ['consumer'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['consumer'] },
      }),
    );
    this.put('package/consumer/entry.ts', `import '../src/${specifier}';`);
  }

  publicModule(path: string): void {
    this.put(
      'architecture/components/sample.json',
      this.component('sample', 'library', {
        parentId: 'package',
        ownership: { paths: ['src'], publicModules: [path], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['src'] },
      }),
    );
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

  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
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
  reportsDerivedOwnership(t: TestContext): void {
    const fixture = new ComponentV4Fixture(t);
    const result = fixture.run('validate');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.owners.sample.repository, 'sample');
    assert.deepEqual(report.owners.sample.ownedPaths, ['package/src']);
    assert.ok(
      report.owners.sample.inventory.some((file: any) => file.path === 'package/src/value.ts'),
    );
    assert.ok(report.coverageExclusions.some((entry: any) => entry.path === 'architecture'));
  }

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

  rejectsOverlappingFutureRoots(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const other = f.component('other', 'library', {
      parentId: 'package',
      ownership: { paths: ['src/future'], publicModules: [], directoryExceptions: [] },
      access: { readPaths: ['.'], writeDirectories: ['src/future'] },
    });
    f.put('architecture/components/other.json', other);
    f.commit();
    assert.match(f.run('validate').stderr, /ownership|owner/);
  }

  rejectsContainerWriteAuthority(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    f.put(
      'architecture/components/package.json',
      f.component('package', 'package', {
        parentId: 'platform',
        repository: 'sample',
        repositoryRoot: 'package',
        ownership: { paths: ['new'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['new'] },
      }),
    );
    f.commit();
    const result = f.run('validate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /containment|container/);
  }

  detectsInventoryChangesAtTheSelectedRevision(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const first = JSON.parse(f.run('inspect', 'sample', 'Inspect', '--json').stdout);
    f.put('package/src/new.ts', 'export const added = true;');
    assert.equal(
      JSON.parse(f.run('inspect', 'sample', 'Inspect', '--json').stdout).context.at(-1).inventory
        .length,
      1,
    );
    f.commit();
    const second = JSON.parse(f.run('inspect', 'sample', 'Inspect', '--json').stdout);
    assert.equal(second.context.at(-1).inventory.length, 2);
    assert.notEqual(first.digest, second.digest);
  }

  separatesRepositoryOwnership(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    f.primaryRepository();
    f.put(
      'architecture/components/other-package.json',
      f.component('other-package', 'package', {
        parentId: 'platform',
        repository: 'other',
        repositoryRoot: 'package',
      }),
    );
    f.put(
      'architecture/components/other.json',
      f.component('other', 'library', {
        parentId: 'other-package',
        ownership: { paths: ['src'], publicModules: [], directoryExceptions: [] },
        access: { readPaths: ['.'], writeDirectories: ['src'] },
      }),
    );
    f.commit();
    const result = f.run('validate');
    assert.equal(result.status, 0, result.stderr);
  }

  packagedCliUsesItsOwnSchemas(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const packageRoot = join(f.root, 'supervisor');
    cpSync(resolve('dist'), join(packageRoot, 'dist'), { recursive: true });
    symlinkSync(resolve('node_modules'), join(packageRoot, 'node_modules'));
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    const result = spawnSync(
      process.execPath,
      [
        join(packageRoot, 'dist/cli.js'),
        'inspect',
        'sample',
        'Inspect packaged schemas',
        '--project',
        f.root,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).context.at(-1).schemaVersion, 4);
  }

  capturesPinnedDependencyContract(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    const dependency = new ComponentV4Fixture(t);
    dependency.put('package/src/value.ts', 'export const remote = 42;');
    dependency.commit();
    f.dependencyCatalog(dependency);
    f.commit();
    const result = f.run(
      'inspect',
      'sample',
      'Read dependency contract',
      '--json',
      '--bindings',
      join(f.root, 'architecture/bindings.json'),
    );
    assert.equal(result.status, 0, result.stderr);
    const resolved = JSON.parse(result.stdout);
    assert.equal(
      resolved.context.at(-1).contractSnapshots[0].artifact.text,
      'export const remote = 42;',
    );
    assert.equal(resolved.workspaceMembers[0].base, dependency.git('rev-parse', 'HEAD'));
  }

  checksImportsBelowPackageRoots(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    f.importingOwner('value.js');
    f.commit();
    const denied = f.run('validate');
    assert.equal(denied.status, 2);
    assert.match(denied.stderr, /Private cross-owner import/);
    f.publicModule('src/value.ts');
    f.commit();
    assert.equal(f.run('validate').status, 0);
  }

  checksMtsPublicModules(t: TestContext): void {
    const f = new ComponentV4Fixture(t);
    f.put('package/src/module.mts', 'export const value = 1;');
    f.importingOwner('module.mjs');
    f.commit();
    assert.equal(f.run('validate').status, 2);
    f.publicModule('src/module.mts');
    f.commit();
    const result = f.run('validate');
    assert.equal(result.status, 0, result.stderr);
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
test('catalog validation exposes derived ownership and captured inventories', (t) =>
  suite.reportsDerivedOwnership(t));
test('v4 derives repository and scope and discovers captured files', (t) =>
  suite.resolvesPackageAndDiscoversFiles(t));
test('v4 detects files outside every ownership root', (t) => suite.rejectsUnownedTrackedFiles(t));

test('v4 captures referenced standards and contract versions', (t) =>
  suite.capturesStandardsAndRejectsMissingReferences(t));

test('v4 rejects overlapping roots before files exist', (t) =>
  suite.rejectsOverlappingFutureRoots(t));
test('v4 rejects write authority on containment nodes', (t) =>
  suite.rejectsContainerWriteAuthority(t));
test('v4 discovers added files only at the captured revision', (t) =>
  suite.detectsInventoryChangesAtTheSelectedRevision(t));

test('v4 distinguishes identical paths owned in independent repositories', (t) =>
  suite.separatesRepositoryOwnership(t));

test('packaged CLI resolves trusted schemas without the source schema tree', (t) =>
  suite.packagedCliUsesItsOwnSchemas(t));

test('v4 captures consumed contracts from pinned bound repositories', (t) =>
  suite.capturesPinnedDependencyContract(t));

test('v4 checks cross-owner imports under a package root', (t) =>
  suite.checksImportsBelowPackageRoots(t));
test('v4 maps compiled mjs imports to declared mts public modules', (t) =>
  suite.checksMtsPublicModules(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
