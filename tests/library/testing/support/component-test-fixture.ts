import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { catalogFixture, componentFields } from './catalog-fixture.js';

/** Builds a real catalog and a tiny Node profile without invoking inference. */
export class ComponentTestFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'arcnexus-tests-'));
  readonly state = join(this.root, 'state');
  readonly repo = join(this.root, 'repo');

  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    mkdirSync(this.repo);
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    catalogFixture(this.repo);
    this.catalog();
    this.profile();
    this.put('.gitignore', '.test-build/\nprepared\n');
    this.suite('unit', 'small', ['fast', 'deterministic']);
    this.suite('regression', 'boundary', ['deterministic'], 'integration');
    this.commit();
  }

  private fields() {
    const base = {
      ...componentFields,
      schemaVersion: 4,
      path: '.',
      purpose: 'Test owner',
      objectives: [],
      constraints: [],
      verification: [],
      access: { readPaths: ['.'], writeDirectories: [] },
    };
    const {
      repository: _repository,
      documentation: _documentation,
      tests: _tests,
      patterns: _patterns,
      ...fields
    } = base;
    return fields;
  }

  private catalog(): void {
    const fields = this.fields();
    this.containers(fields);
    this.put('architecture/components/sample.yaml', {
      ...fields,
      id: 'sample',
      type: 'library',
      parentId: 'package',
      ownership: { paths: ['tests'], publicModules: [], directoryExceptions: [] },
      access: { readPaths: ['.'], writeDirectories: ['tests'] },
      testProfile: 'node',
      verification: [{ command: process.execPath, args: ['-e', 'process.exit(0)'] }],
      discovery: { source: [], documentation: [], tests: ['tests'], exclude: [] },
    });
    this.put('architecture/environment.yaml', {
      schemaVersion: 1,
      prerequisites: [],
      setup: [],
      generatedDirectories: ['.test-build'],
    });
  }

  private containers(fields: ReturnType<ComponentTestFixture['fields']>): void {
    this.put('architecture/components/platform.yaml', {
      ...fields,
      id: 'platform',
      type: 'platform',
      initialization: { schemaVersion: 3, componentId: 'sample' },
      coverageExclusions: [
        { path: 'architecture', reason: 'Fixture configuration' },
        { path: 'build.cjs', reason: 'Fixture preparation' },
        { path: '.gitignore', reason: 'Fixture outputs' },
      ],
    });
    this.put('architecture/components/package.yaml', {
      ...fields,
      id: 'package',
      type: 'package',
      parentId: 'platform',
      repository: 'sample',
      repositoryRoot: '.',
    });
  }

  profile(overrides: Record<string, unknown> = {}): void {
    this.put('architecture/test-profiles/node.yaml', {
      schemaVersion: 1,
      id: 'node',
      adapter: 'node',
      outputRoot: '.test-build',
      preparation: [{ command: process.execPath, args: ['build.cjs'], purpose: 'tests' }],
      ...overrides,
    });
    this.put(
      'build.cjs',
      "const fs=require('fs'); fs.appendFileSync('prepared','built\\n'); fs.cpSync('tests','.test-build',{recursive:true}); for(const p of fs.readdirSync('.test-build',{recursive:true})) if(p.endsWith('.ts'))fs.renameSync('.test-build/'+p,'.test-build/'+p.replace(/\\.ts$/,'.js')); ",
    );
  }

  suite(category: string, name: string, tags: string[], level = category): void {
    this.put(
      `tests/${category}/${name}.test.ts`,
      `import {test} from 'node:test';\nfunction registerSuite(value) {}\nregisterSuite(${JSON.stringify({ component: 'sample', level, tags })});\ntest('${name}',()=>{});\n`,
    );
  }

  put(path: string, value: unknown): void {
    mkdirSync(dirname(join(this.repo, path)), { recursive: true });
    writeFileSync(join(this.repo, path), typeof value === 'string' ? value : JSON.stringify(value));
  }

  commit(): void {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  }

  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  unusedProfile(): void {
    const path = 'architecture/components/sample.yaml';
    const sample = JSON.parse(readFileSync(join(this.repo, path), 'utf8'));
    sample.ownership.paths = ['tests/unit', 'tests/regression'];
    sample.discovery.tests = sample.ownership.paths;
    sample.access.writeDirectories = sample.ownership.paths;
    this.put(path, sample);
    this.put('architecture/components/other.yaml', {
      ...sample,
      id: 'other',
      testProfile: 'other',
      ownership: { paths: ['tests/other'], publicModules: [], directoryExceptions: [] },
      discovery: { ...sample.discovery, tests: ['tests/other'] },
      access: { readPaths: ['.'], writeDirectories: ['tests/other'] },
    });
    this.otherProfile();
    this.commit();
  }

  private otherProfile(): void {
    this.put('architecture/test-profiles/other.yaml', {
      schemaVersion: 1,
      id: 'other',
      adapter: 'node',
      outputRoot: '.test-build',
      preparation: [
        { command: process.execPath, args: ['-e', 'process.exit(9)'], purpose: 'tests' },
      ],
    });
    this.put(
      'tests/other/unit/other.test.ts',
      "function registerSuite(value) {}\nregisterSuite({component:'other',level:'unit',tags:['slow']});",
    );
  }

  assignment(): any {
    const result = spawnSync(
      process.execPath,
      [
        resolve('dist/cli.js'),
        'inspect',
        'sample',
        'Improve tests',
        '--project',
        this.repo,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }

  run(...args: string[]) {
    return spawnSync(
      process.execPath,
      [resolve('dist/cli.js'), 'test', ...args, '--project', this.repo, '--json'],
      { encoding: 'utf8', env: { ...process.env, ARCNEXUS_STATE_DIR: this.state } },
    );
  }
}
