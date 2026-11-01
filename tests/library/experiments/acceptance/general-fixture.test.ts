import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { materializeFixture } from '../../testing/support/fixture-payloads.js';

/** Qualifies the shipped multi-owner package and its prompt-only campaign without inference. */
class GeneralFixtureScenarios {
  /** The compiled fixture discovers three owners and resolves a campaign without participant manifests. */
  inspect(t: TestContext): void {
    const { root, repo } = this.fixture(t);
    const context = new ExecutionContext().resolve(repo);
    assert.deepEqual(context.owners.sort(), ['cli', 'names', 'service']);
    assert.equal(context.directorProfile, 'astra');
    assert.equal(context.reviewerProfile, 'astra');
    assert.ok(
      context.owners.every(
        (owner) => context.catalog.components[owner]!.executionProfile === 'luna',
      ),
    );
    const input = this.campaign(root, repo, context.base);
    assert.equal(input.schemaVersion, 3);
    assert.equal(input.cases.length, 1);
    assert.match(input.cases[0].prompt, /Start only with cli/);
    assert.equal(existsSync(join(repo, '.git/arcnexus')), false);
    this.command(repo, ['node', '--test', 'cli/test.mjs', 'service/test.mjs', 'names/test.mjs']);
  }

  /** Resolves the shipped prompt campaign through the assembled public CLI without starting inference. */
  private campaign(root: string, repo: string, base: string) {
    const bindings = join(root, 'bindings.json');
    writeFileSync(
      bindings,
      JSON.stringify({
        schemaVersion: 1,
        runner: resolve('dist/cli.js'),
        codexPath: process.execPath,
        projects: { greetings: { path: repo, base } },
        tools: {},
      }),
    );
    const result = this.command(repo, [
      'node',
      resolve('dist/cli.js'),
      'experiment',
      'inspect',
      resolve('experiments/general-live.yaml'),
      '--bindings',
      bindings,
      '--json',
    ]);
    return JSON.parse(result.stdout);
  }

  /** Materializes compiled payloads into an independent committed repository. */
  private fixture(t: TestContext) {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-general-fixture-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repo = join(root, 'repo');
    materializeFixture('general', repo);
    this.command(repo, ['git', 'init', '-q']);
    this.command(repo, ['git', 'config', 'user.name', 'Test']);
    this.command(repo, ['git', 'config', 'user.email', 'test@example.invalid']);
    this.command(repo, ['git', 'add', '.']);
    this.command(repo, ['git', 'commit', '-qm', 'Captured general fixture']);
    return { root, repo };
  }

  /** Runs actual program checks with a test-only watchdog and complete failure diagnostics. */
  private command(cwd: string, [command, ...args]: string[]) {
    const result = spawnSync(command === 'node' ? process.execPath : command!, args, {
      cwd,
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result;
  }
}

const scenarios = new GeneralFixtureScenarios();

test('bundled general fixture discovers three stewards and resolves the prompt-only live campaign', (t) =>
  scenarios.inspect(t));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
