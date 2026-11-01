import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { cli } from '../../testing/support/workflow-fixture.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Replaces a disposable installation after startup to prove the host retains its own runner. */
class RunnerSnapshotScenario {
  /** Executes a real CLI task after making the originating installation unusable. */
  run(t: TestContext): void {
    const general = new GeneralFixture(t);
    const f = general.fixture;
    const installation = join(f.state, 'installation');
    this.install(installation);
    this.command(general, join(installation, 'dist/cli.js'), 'workday', 'status');
    general.captureHost();
    const project = readdirSync(join(f.state, 'projects'))[0]!;
    const host = JSON.parse(readFileSync(join(f.state, 'projects', project, 'host.json'), 'utf8'));
    assert.ok(host.runner?.directory, 'Host must retain its supervising runner');
    assert.match(host.runner.hash, /^[a-f0-9]{64}$/);
    assert.notEqual(host.runner.directory, installation);
    this.replace(installation);
    const output = this.command(general, cli, 'task', 'run', 'Research supplier evidence');
    assert.equal(JSON.parse(output.trim().split('\n').at(-1)!).run.status, 'completed');
    assert.equal(
      readFileSync(join(host.runner.directory, 'package.json'), 'utf8'),
      readFileSync(resolve(dirname(cli), '../package.json'), 'utf8'),
    );
  }

  /** Copies only disposable build files and shares dependency input until runtime capture. */
  private install(directory: string): void {
    const source = resolve(dirname(cli), '..');
    mkdirSync(directory, { recursive: true });
    cpSync(join(source, 'dist'), join(directory, 'dist'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json'])
      cpSync(join(source, name), join(directory, name));
    symlinkSync(join(source, 'node_modules'), join(directory, 'node_modules'), 'dir');
  }

  /** Corrupts modules used by both the host and its subsequently spawned managed helpers. */
  private replace(directory: string): void {
    for (const name of ['host-main.js', '../operations/command-supervisor.js']) {
      const path = join(directory, 'dist/library/execution-runtime', name);
      writeFileSync(path, 'throw new Error("Installation was rebuilt");\n');
    }
  }

  /** Runs the public built CLI with an external watchdog and preserves useful failure output. */
  private command(general: GeneralFixture, entry: string, ...args: string[]): string {
    const f = general.fixture;
    const result = spawnSync(process.execPath, [entry, ...args], {
      cwd: f.repo,
      env: f.env,
      encoding: 'utf8',
      timeout: 180_000,
    });
    assert.equal(result.status, 0, result.stderr + result.stdout.slice(-2000));
    return result.stdout;
  }
}

const scenario = new RunnerSnapshotScenario();

test('background execution survives replacement of its originating installation', (t) =>
  scenario.run(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
