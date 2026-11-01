import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';

export const cli = resolve('dist/cli.js');

export function fixture(t: TestContext): ArchitectureFixture {
  return new ArchitectureFixture(t);
}

/** Exercises architecture fixture behavior through observable scenarios. */
export class ArchitectureFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'architecture-'));

  readonly repo = join(this.root, 'repo');

  readonly common = {
    schemaVersion: 1,
    repository: 'sample',
    purpose: 'Own sample behavior',
    path: '.',
    objectives: [],
    constraints: [],
    questions: [],
    patterns: [],
    interfaces: [],
    documentation: ['README.md'],
    tests: ['test.mjs'],
    relatedIds: [],
    role: 'engineer',
    executionProfile: 'luna',
    access: { readPaths: ['.'], writeDirectories: ['.'] },
    allowedWritePaths: ['source.txt'],
    verification: [{ command: 'node', args: ['--version'] }],
  };

  component: any;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    mkdirSync(this.repo);
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    this.hierarchy();
    this.execution();
    this.environment();
    writeFileSync(join(this.repo, 'source.txt'), 'before');
    writeFileSync(join(this.repo, 'README.md'), 'Sample');
    writeFileSync(join(this.repo, 'test.mjs'), '');
    this.commit();
  }

  /** Handles git within this component’s captured contract. */
  private git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  /** Handles put within this component’s captured contract. */
  put(path: string, value: unknown): void {
    mkdirSync(join(this.repo, path, '..'), { recursive: true });
    writeFileSync(join(this.repo, path), JSON.stringify(value));
  }

  /** Handles source within this component’s captured contract. */
  source(path: string, content: string): void {
    mkdirSync(join(this.repo, path, '..'), { recursive: true });
    writeFileSync(join(this.repo, path), content);
  }

  /** Handles commit within this component’s captured contract. */
  commit(): void {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(...args: string[]) {
    return spawnSync(process.execPath, [cli, ...args, '--project', this.repo], {
      encoding: 'utf8',
      env: { ...process.env, ARCNEXUS_STATE_DIR: join(this.root, 'state') },
    });
  }

  /** Handles hierarchy within this component’s captured contract. */
  private hierarchy(): void {
    this.put('architecture/components/platform.json', {
      ...this.common,
      id: 'platform',
      type: 'platform',
      allowedWritePaths: ['.'],
    });
    this.put('architecture/components/package.json', {
      ...this.common,
      id: 'package',
      type: 'package',
      parentId: 'platform',
      allowedWritePaths: ['.'],
      members: {
        foundations: [],
        dependencies: [],
        gateways: [],
        libraries: ['sample'],
        releases: [],
      },
    });
    this.component = { ...this.common, id: 'sample', type: 'library', parentId: 'package' };
    this.put('architecture/components/sample.json', this.component);
  }

  /** Handles execution within this component’s captured contract. */
  private execution(): void {
    this.put('architecture/roles/engineer.json', {
      schemaVersion: 1,
      id: 'engineer',
      purpose: 'Engineering',
      responsibilities: ['Verify bounded work'],
      activities: ['research', 'documentation', 'testing', 'implementation', 'review', 'release'],
    });
    this.put('architecture/execution-profiles/luna.yaml', {
      schemaVersion: 1,
      id: 'luna',
      model: 'gpt-6-luna',
      reasoning: 'medium',
      webSearch: 'live',
      timeoutSeconds: 900,
      commandTimeoutSeconds: 120,
      maxTurns: 3,
      maxCorrectiveTurns: 2,
    });
  }

  /** Handles environment within this component’s captured contract. */
  private environment(): void {
    this.put('architecture/environment.json', {
      schemaVersion: 1,
      prerequisites: [],
      setup: [],
      generatedDirectories: [],
    });
  }
}
