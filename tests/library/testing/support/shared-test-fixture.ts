import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { MinimalTestFixture } from './minimal-test-fixture.js';

/** Captures shared test operations and real generated outputs without inline execution recipes. */
export class SharedTestFixture extends MinimalTestFixture {
  /** Migrates the fixture's test profile and executable configuration to shared operations. */
  constructor(t: TestContext) {
    super(t);
    this.configuration();
    this.put('architecture/execution-profiles/luna.yaml', {
      schemaVersion: 3,
      id: 'luna',
      model: 'fixture-model',
      reasoning: 'medium',
      webSearch: 'disabled',
      operationCategories: ['unit-test'],
    });
    this.operation('compile', ['build.cjs']);
    this.operation('suites', ['--test', { context: 'selectedTestFiles' }]);
    this.put(
      'build.cjs',
      "const f=require('fs');f.cpSync('tests','.test-build',{recursive:true});for(const p of f.readdirSync('.test-build',{recursive:true}))if(p.endsWith('.ts'))f.renameSync('.test-build/'+p,'.test-build/'+p.replace(/\\.ts$/,'.js'));f.appendFileSync('.test-build/prepared','once\\n');",
    );
    this.commit();
  }

  /** Adds a second independent test owner sharing the package's operations and profile. */
  anotherOwner(): void {
    this.extend(
      'architecture/components/sample.yaml',
      (value) => (value.owns = ['tests/unit', 'tests/regression']),
    );
    this.put('architecture/components/other.yaml', {
      schemaVersion: 5,
      id: 'other',
      type: 'library',
      parentId: 'package',
      purpose: 'Own another suite',
      owns: ['tests/other'],
    });
    this.put(
      'tests/other/unit/other.test.ts',
      "import {test} from 'node:test';function registerSuite(x) {}\nregisterSuite({component:'other',level:'unit'});test('other',()=>{});",
    );
    this.commit();
  }

  /** Gives operation definitions one maintenance owner and inherits their usages at package level. */
  private configuration(): void {
    this.extend('architecture/components/maintenance.yaml', (value) =>
      value.owns.push('architecture/operations'),
    );
    this.extend(
      'architecture/components/package.yaml',
      (value) => (value.operations = { compile: ['setup'], suites: ['agent', 'verify'] }),
    );
    this.put('architecture/environment.yaml', {
      schemaVersion: 4,
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    });
    this.put('architecture/test-profiles/node.yaml', {
      schemaVersion: 2,
      id: 'node',
      adapter: 'node',
      outputRoot: '.test-build',
      preparation: [{ operation: 'compile', purpose: 'tests' }],
      run: 'suites',
    });
  }

  /** Defines one finite command with explicitly declared generated output and host context tokens. */
  private operation(id: string, args: unknown[]): void {
    this.put(`architecture/operations/${id}.yaml`, {
      schemaVersion: 4,
      id,
      purpose: 'Run selected tests',
      kind: 'command',
      repository: 'sample',
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      command: 'node',
      args,
      generatedDirectories: ['.test-build'],
      artifacts: [],
      prerequisites: [],
      network: false,
    });
  }

  /** Changes a fixture declaration before capturing its new authority revision. */
  extend(path: string, edit: (value: any) => void): void {
    const value = JSON.parse(readFileSync(join(this.repo, path), 'utf8'));
    edit(value);
    this.put(path, value);
  }

  /** Supplies installed executable bindings outside source authority for actual confinement tests. */
  bindings(): string {
    const path = join(this.root, 'bindings.json');
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        repositories: {},
        tools: { codex: process.env.ARCNEXUS_TEST_CODEX, node: process.execPath },
      }),
    );
    return path;
  }
}
