import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, existsSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { parse } from 'yaml';

/** Exercises catalog ownership behavior through observable scenarios. */
class CatalogOwnershipTests {
  /** Verifies that built inspect assigns every real source module to one executable owner. */
  builtInspectAssignsEveryRealSourceModuleToOneExecutableOwner(t: TestContext) {
    this.protectedDirectories(t);
    const components = readdirSync('architecture/components')
      .map((f: any) => parse(readFileSync('architecture/components/' + f, 'utf8')))
      .filter((c: any) => !['platform', 'package'].includes(c.type));
    const owners = components.map((component: any) => this.inspectOwner(component.id));
    const files = readdirSync('src', { recursive: true }).filter((p: any) => p.endsWith('.ts'));
    for (const name of files) {
      const path = 'src/' + name;
      assert.equal(
        owners.filter((c: any) =>
          c.allowedWritePaths.some((p: any) => p === path || path.startsWith(p + '/')),
        ).length,
        1,
        `${path} must have one executable owner`,
      );
    }
  }

  /** Reproduces empty protection directories created by the real Codex sandbox. */
  private protectedDirectories(t: TestContext): void {
    for (const name of ['.agents', '.aws', '.codex', '.git']) {
      const path = 'architecture/components/' + name;
      if (existsSync(path)) continue;
      mkdirSync(path);
      t.after(() => rmdirSync(path));
    }
  }

  /** Handles inspect owner within this component’s captured contract. */
  private inspectOwner(id: string): any {
    const r = spawnSync(
      process.execPath,
      [
        resolve('dist/cli.js'),
        'inspect',
        id,
        'Inspect ownership',
        '--project',
        process.cwd(),
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).context.at(-1);
  }
}

const suite = new CatalogOwnershipTests();

test('built inspect assigns every real source module to one executable owner', (t) =>
  suite.builtInspectAssignsEveryRealSourceModuleToOneExecutableOwner(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
