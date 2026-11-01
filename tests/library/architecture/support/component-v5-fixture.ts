import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';

/** Builds a completely owned minimal catalog without legacy component fields. */
export class ComponentV5Fixture {
  readonly root = mkdtempSync(join(tmpdir(), 'component-v5-'));

  /** Captures a clean source revision and removes only this fixture after the scenario. */
  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    this.environment();
    this.containers();
    this.owners();
    this.put('package/src/value.ts', 'export const value = 1;');
    this.put('package/docs/value.md', 'Value is one.');
    this.put('package/tests/value.test.ts', '// Test classification without execution.');
    this.commit();
  }

  /** Supplies profile/role authority and a primary repository without inline execution recipes. */
  private environment(): void {
    this.put('architecture/environment.json', {
      schemaVersion: 3,
      prerequisites: [],
      setup: [],
      generatedDirectories: [],
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    });
    this.put('architecture/roles/engineer.json', {
      schemaVersion: 3,
      id: 'engineer',
      purpose: 'Engineer bounded changes',
      responsibilities: ['Verify changes'],
      activities: ['research', 'testing', 'implementation', 'review'],
    });
    this.put('architecture/execution-profiles/luna.json', {
      schemaVersion: 3,
      id: 'luna',
      model: 'gpt-6-luna',
      reasoning: 'medium',
      webSearch: 'disabled',
      operationCategories: ['unit-test'],
    });
  }

  /** Declares container defaults and disjoint leaf scope, including catalog maintenance. */
  private containers(): void {
    this.put(
      'architecture/components/platform.json',
      this.component('platform', 'platform', {
        role: 'engineer',
        executionProfile: 'luna',
        reads: ['.'],
        constraints: ['Preserve authority'],
      }),
    );
    this.put(
      'architecture/components/package.json',
      this.component('package', 'package', {
        parentId: 'platform',
        root: 'package',
      }),
    );
    this.put(
      'architecture/components/maintenance-package.json',
      this.component('maintenance-package', 'package', {
        parentId: 'platform',
      }),
    );
  }

  /** Assigns configuration maintenance and a leaf with implicit definition ownership. */
  private owners(): void {
    this.put(
      'architecture/components/maintenance.json',
      this.component('maintenance', 'foundation', {
        parentId: 'maintenance-package',
        owns: [
          'architecture/environment.json',
          'architecture/roles',
          'architecture/execution-profiles',
          'architecture/components/platform.json',
          'architecture/components/package.json',
          'architecture/components/maintenance-package.json',
        ],
      }),
    );
    this.put(
      'architecture/components/unrelated-filename.json',
      this.component('sample', 'library', {
        parentId: 'package',
        owns: ['src', 'docs', 'tests'],
        api: [{ module: 'src/value.ts' }],
      }),
    );
  }

  /** Builds a declaration whose absent fields must be inherited or derived. */
  component(id: string, type: string, extra: object = {}): any {
    return { schemaVersion: 5, id, type, purpose: 'Own bounded behavior', ...extra };
  }

  /** Writes source or JSON without interpreting candidate content as current authority. */
  put(path: string, value: unknown): void {
    mkdirSync(join(this.root, path, '..'), { recursive: true });
    writeFileSync(join(this.root, path), typeof value === 'string' ? value : JSON.stringify(value));
  }

  /** Commits the fixture revision used by the assembled CLI. */
  commit(): void {
    this.git('add', '.');
    this.git('commit', '-m', 'fixture');
  }

  /** Runs Git and fails the scenario on repository setup errors. */
  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  /** Invokes the actual assembled CLI with complete output for catalog assertions. */
  run(...args: string[]) {
    return spawnSync(process.execPath, [resolve('dist/cli.js'), ...args, '--project', this.root], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  }
}
