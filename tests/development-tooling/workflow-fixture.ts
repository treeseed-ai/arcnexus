import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { catalogFixture, componentFields } from './catalog-fixture.js';
import type { WorkflowOptions } from './controlled-workflow.js';
export const cli = resolve('dist/cli.js');
export function workflowFixture(t: TestContext, mode = 'success'): WorkflowFixture {
  return new WorkflowFixture(t, mode);
}
export class WorkflowFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'arcnexus-workflow-'));
  readonly repo = join(this.root, 'repo');
  readonly state = join(this.root, 'state');
  readonly calls = join(this.root, 'calls.jsonl');
  readonly executable = join(this.root, 'codex');
  readonly env = { ...process.env, ARCNEXUS_STATE_DIR: this.state };
  readonly component: any = {
    ...componentFields,
    id: 'sample',
    type: 'library',
    purpose: 'Own sample behavior',
    path: 'source.txt',
    objectives: ['Bounded change'],
    constraints: ['No commits'],
    documentation: ['docs'],
    tests: ['tests'],
    access: { readPaths: ['.'], writeDirectories: ['.'] },
    allowedWritePaths: ['source.txt', 'docs', 'tests', 'new.txt'],
    verification: [{ command: 'node', args: ['verify.cjs'] }],
  };
  private options: WorkflowOptions;
  constructor(t: TestContext, mode: string) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    this.options = { mode, calls: this.calls };
    mkdirSync(join(this.repo, 'architecture/components'), { recursive: true });
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    this.files();
    this.catalog();
    this.configure({});
    this.commit();
  }
  git = (...args: string[]): string => {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  commit = (): void => {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  };
  run = (...args: string[]) => {
    return spawnSync(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        'Improve behavior',
        '--project',
        this.repo,
        '--codex-path',
        this.executable,
        ...args,
      ],
      { encoding: 'utf8', env: this.env, timeout: 30 * 60 * 1000 },
    );
  };
  configure = (options: Partial<WorkflowOptions>): void => {
    Object.assign(this.options, options);
    const module = pathToFileURL(
      resolve('.test-build/development-tooling/controlled-workflow.js'),
    ).href;
    writeFileSync(
      this.executable,
      `#!/usr/bin/env node\nimport(${JSON.stringify(module)}).then(({ControlledWorkflow}) => new ControlledWorkflow(${JSON.stringify(this.options)}).run());\n`,
      { mode: 0o755 },
    );
  };
  private files(): void {
    catalogFixture(this.repo);
    mkdirSync(join(this.repo, 'docs'));
    mkdirSync(join(this.repo, 'tests'));
    writeFileSync(join(this.repo, 'docs/behavior.md'), 'Before');
    writeFileSync(join(this.repo, 'tests/.keep'), '');
    writeFileSync(join(this.repo, 'source.txt'), 'before');
    writeFileSync(join(this.repo, '.gitignore'), '.env\ngenerated/\n');
    writeFileSync(
      join(this.repo, 'verify.cjs'),
      "const fs=require('fs');if(fs.existsSync('tests/regression.cjs'))require('./tests/regression.cjs');if(fs.readFileSync('source.txt','utf8')==='broken')process.exit(6);",
    );
  }
  private catalog(): void {
    writeFileSync(
      join(this.repo, 'architecture/components/sample.json'),
      JSON.stringify(this.component),
    );
    writeFileSync(
      join(this.repo, 'architecture/components/dependency.json'),
      JSON.stringify({ ...this.component, id: 'dependency', purpose: 'Own dependency interface' }),
    );
    writeFileSync(
      join(this.repo, 'architecture/environment.yaml'),
      JSON.stringify({
        schemaVersion: 1,
        prerequisites: [],
        setup: [],
        generatedDirectories: ['generated'],
      }),
    );
  }
}
