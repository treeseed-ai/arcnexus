import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type TestContext } from 'node:test';
import { catalogFixture } from '../../testing/support/catalog-fixture.js';

/** Exercises component v4 fixture behavior through observable scenarios. */
export class ComponentV4Fixture {
  readonly root = mkdtempSync(join(tmpdir(), 'component-v4-'));

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
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

  /** Handles hierarchy within this component’s captured contract. */
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

  /** Handles references within this component’s captured contract. */
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

  /** Handles pattern within this component’s captured contract. */
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

  /** Handles primary repository within this component’s captured contract. */
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

  /** Handles dependency catalog within this component’s captured contract. */
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

  /** Handles other owner within this component’s captured contract. */
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

  /** Handles consumer within this component’s captured contract. */
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

  /** Handles importing owner within this component’s captured contract. */
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

  /** Handles public module within this component’s captured contract. */
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

  /** Handles component within this component’s captured contract. */
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

  /** Handles put within this component’s captured contract. */
  put(path: string, value: unknown): void {
    mkdirSync(join(this.root, path, '..'), { recursive: true });
    writeFileSync(join(this.root, path), typeof value === 'string' ? value : JSON.stringify(value));
  }

  /** Handles git within this component’s captured contract. */
  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  /** Handles commit within this component’s captured contract. */
  commit(): void {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(...args: string[]) {
    return spawnSync(process.execPath, [resolve('dist/cli.js'), ...args, '--project', this.root], {
      encoding: 'utf8',
    });
  }
}
