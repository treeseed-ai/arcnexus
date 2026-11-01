import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { materializeFixture } from '../../testing/support/fixture-payloads.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';

/** Exercises experiments behavior through observable scenarios. */
class ExperimentsTests {
  /** Historical manifests remain readable but cannot start a retired execution engine. */
  retired(t: TestContext): void {
    const f = fixture(t);
    const result = f.runCampaign();
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /retired.*schemaVersion 3/);
    assert.equal(existsSync(f.output), false);
    assert.equal(existsSync(f.state), false);
  }

  /** Verifies that built experiment inspect resolves pinned cases without workspaces or inference. */
  builtExperimentInspectResolvesPinnedCasesWithoutWorkspacesOrInference(t: TestContext) {
    const f = fixture(t),
      r = f.run('inspect', f.manifest, '--bindings', f.bindings, '--json');
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.cases.length, 4);
    assert.equal(d.cases[0].base, f.base);
    assert.ok(d.digest);
    assert.equal(existsSync(f.state), false);
  }
}

const suite = new ExperimentsTests();

const cli = resolve('dist/cli.js');

function fixture(t: TestContext): ExperimentFixture {
  return new ExperimentFixture(t);
}

/** Exercises experiment fixture behavior through observable scenarios. */
class ExperimentFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'arcnexus-experiment-'));

  readonly repo = join(this.root, 'repo');

  readonly state = join(this.root, 'state');

  readonly output = join(this.root, 'campaign');

  readonly bindings = join(this.root, 'bindings.json');

  readonly manifest = resolve('experiments/simulation.historical.yaml');

  readonly base: string;

  readonly value: any;

  /** Materializes a pinned simulation repository and external campaign inputs with automatic test cleanup. */
  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    materializeFixture('simulation', this.repo);
    this.git('init', '-q');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    this.git('add', '.');
    this.git('commit', '-qm', 'fixture');
    this.base = this.git('rev-parse', 'HEAD');
    this.value = {
      schemaVersion: 1,
      runner: cli,
      projects: { fixture: { path: this.repo, base: this.base } },
      tools: { node: process.execPath },
      priorEvidence: {},
      issues: {},
    };
    writeFileSync(this.bindings, JSON.stringify(this.value));
  }

  /** Runs Git against the fixture repository and propagates command failures. */
  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(...args: string[]) {
    return spawnSync(process.execPath, [cli, 'experiment', ...args], {
      env: { ...process.env, ARCNEXUS_STATE_DIR: this.state },
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    });
  }

  /** Builds explicit simulation arguments with a fresh external evidence destination. */
  campaignArgs(manifest = this.manifest): string[] {
    return [
      'run',
      manifest,
      '--bindings',
      this.bindings,
      '--mode',
      'simulation',
      '--output',
      this.output,
    ];
  }

  /** Runs the scripted campaign through the production experiment CLI. */
  runCampaign(manifest = this.manifest) {
    return this.run(...this.campaignArgs(manifest));
  }
}

test('built experiment inspect resolves pinned cases without workspaces or inference', (t: any) =>
  suite.builtExperimentInspectResolvesPinnedCasesWithoutWorkspacesOrInference(t));

test('historical campaign execution fails before creating state', (t) => suite.retired(t));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
