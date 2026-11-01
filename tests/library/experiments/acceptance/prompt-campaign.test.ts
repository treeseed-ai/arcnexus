import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { TestProcess, waitFor } from '../../testing/support/test-process.js';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';
import { cli } from '../../testing/support/workflow-fixture.js';

/** Exercises prompt campaigns through ordinary task execution without a participant manifest. */
class PromptCampaignScenarios {
  /** A single prompt dynamically activates three owners and retains verified task evidence. */
  run(t: TestContext): void {
    const fixture = this.fixture(t);
    const { f, output } = fixture;
    const result = this.execute(fixture);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(output, 'campaign.json'), 'utf8'));
    assert.equal(report.evidenceMode, 'simulation');
    assert.equal(report.cases[0].task.run.status, 'completed');
    assert.equal(report.cases[0].task.counts.verified, 3);
    assert.deepEqual(
      report.cases[0].task.assignments.map((a: any) => a.owner),
      ['a', 'b', 'c'],
    );
    assert.ok(report.cases[0].task.run.data.goalEvidence.length);
    assert.equal(f.git('status', '--porcelain'), '');
    assert.ok(existsSync(report.cases[0].state));
  }

  /** Inspection captures a clean pinned source and rejects dirty source before any case starts. */
  dirty(t: TestContext): void {
    const fixture = this.fixture(t);
    const { f, output } = fixture;
    writeFileSync(join(f.repo, 'source.txt'), 'uncommitted');
    const result = this.execute(fixture);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /clean/);
    assert.equal(existsSync(output), false);
  }

  /** Campaign SIGINT cancels the detached host's active managed worker and retains its task evidence. */
  async cancel(t: TestContext): Promise<void> {
    const gate = join(tmpdir(), 'arcnexus-campaign-' + randomUUID());
    t.after(() => rmSync(gate + '.entered', { force: true }));
    const { f, manifest, bindings, output } = this.fixture(t, gate);
    const child = new TestProcess(t, this.command({ manifest, bindings, output }), f.env);
    await child.waitForReady(() => existsSync(gate + '.entered'), 'Case worker must start');
    const pid = Number(readFileSync(gate + '.entered', 'utf8'));
    child.kill('SIGINT');
    assert.equal(await child.closed, 130);
    await waitFor(() => !existsSync('/proc/' + pid), 'Case worker must stop', 5000);
    const report = JSON.parse(readFileSync(join(output, 'campaign.json'), 'utf8'));
    assert.equal(report.status, 'cancelled');
    assert.equal(report.cases[0].task.run.status, 'cancelled');
    assert.ok(report.cases[0].task.report);
  }

  /** Invalid project pins and missing project bindings fail before campaign materialization. */
  invalidBindings(t: TestContext): void {
    const fixture = this.fixture(t);
    const original = JSON.parse(readFileSync(fixture.bindings, 'utf8'));
    for (const projects of [{}, { fixture: { path: fixture.f.repo, base: 'HEAD' } }]) {
      writeFileSync(fixture.bindings, JSON.stringify({ ...original, projects }));
      assert.equal(this.execute(fixture).status, 2);
      assert.equal(existsSync(fixture.output), false);
    }
  }

  /** A case cannot be called passed merely because its worker completed when the requested outcome differs. */
  mismatch(t: TestContext): void {
    const fixture = this.fixture(t);
    const manifest = JSON.parse(readFileSync(fixture.manifest, 'utf8'));
    manifest.cases[0].expectedOutcome = 'needs_input';
    writeFileSync(fixture.manifest, JSON.stringify(manifest));
    const result = this.execute(fixture);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(join(fixture.output, 'campaign.json'), 'utf8'));
    assert.equal(report.cases[0].task.run.status, 'completed');
    assert.equal(report.cases[0].status, 'failed');
    assert.match(report.cases[0].error, /Unexpected task outcome/);
  }

  /** Supervising-code drift invalidates a campaign even when its isolated task completed successfully. */
  async supervisor(t: TestContext): Promise<void> {
    const gate = join(tmpdir(), 'arcnexus-campaign-' + randomUUID());
    t.after(() => {
      rmSync(gate, { force: true });
      rmSync(gate + '.entered', { force: true });
    });
    const fixture = this.fixture(t, gate);
    const runner = this.copySupervisor(fixture);
    const child = new TestProcess(t, this.command(fixture), fixture.f.env);
    await child.waitForReady(
      () => existsSync(gate + '.entered'),
      'Case must reach a captured turn',
    );
    writeFileSync(runner, readFileSync(runner, 'utf8') + '\n// changed supervising build\n');
    writeFileSync(gate, 'continue');
    assert.equal(await child.closed, 1);
    const report = JSON.parse(readFileSync(join(fixture.output, 'campaign.json'), 'utf8'));
    assert.equal(report.cases[0].task.run.status, 'completed');
    assert.equal(report.status, 'failed');
    assert.match(report.error, /Supervising build changed/);
  }

  /** All cases use captured source and prompt inputs even if their originals change after dispatch. */
  async capturedInputs(t: TestContext): Promise<void> {
    const gate = join(tmpdir(), 'arcnexus-campaign-' + randomUUID());
    t.after(() => {
      rmSync(gate, { force: true });
      rmSync(gate + '.entered', { force: true });
    });
    const fixture = this.fixture(t, gate);
    const manifest = JSON.parse(readFileSync(fixture.manifest, 'utf8'));
    manifest.cases.push({ ...manifest.cases[0], id: 'second' });
    writeFileSync(fixture.manifest, JSON.stringify(manifest));
    const child = new TestProcess(t, this.command(fixture), fixture.f.env);
    await child.waitForReady(() => existsSync(gate + '.entered'), 'First case must start');
    writeFileSync(fixture.manifest, '{}');
    writeFileSync(fixture.bindings, '{}');
    writeFileSync(join(fixture.f.repo, 'verify.cjs'), 'process.exit(19)');
    writeFileSync(gate, 'continue');
    assert.equal(await child.closed, 0, child.stderr);
    const report = JSON.parse(readFileSync(join(fixture.output, 'campaign.json'), 'utf8'));
    assert.deepEqual(
      report.cases.map((c: any) => c.status),
      ['passed', 'passed'],
    );
    assert.notEqual(report.cases[0].source, report.cases[1].source);
  }

  /** Copies an independent runner so mutation checks never edit the supervisor running other tests. */
  private copySupervisor(fixture: ReturnType<PromptCampaignScenarios['fixture']>): string {
    const root = join(fixture.f.root, 'supervisor');
    for (const name of ['dist', '.fixture-build', 'fixtures', 'package.json', 'package-lock.json'])
      cpSync(resolve(name), join(root, name), { recursive: true });
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    const bindings = JSON.parse(readFileSync(fixture.bindings, 'utf8'));
    bindings.runner = join(root, 'dist/cli.js');
    writeFileSync(fixture.bindings, JSON.stringify(bindings));
    return bindings.runner;
  }

  /** Invokes the assembled CLI with the same external watchdog and output capture for each case. */
  private execute({
    f,
    manifest,
    bindings,
    output,
  }: ReturnType<PromptCampaignScenarios['fixture']>) {
    return spawnSync(process.execPath, this.command({ manifest, bindings, output }), {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    });
  }

  /** Builds the single ordinary campaign CLI shape used by synchronous and cancellable scenarios. */
  private command(value: { manifest: string; bindings: string; output: string }): string[] {
    return [
      cli,
      'experiment',
      'run',
      value.manifest,
      '--bindings',
      value.bindings,
      '--mode',
      'simulation',
      '--output',
      value.output,
    ];
  }

  /** Defines only a prompt, source binding and expected outcome; package authority supplies the rest. */
  private fixture(t: TestContext, gate?: string) {
    const f = new GeneralFixture(t, gate).fixture;
    const manifest = join(f.root, 'prompt-campaign.json');
    const bindings = join(f.root, 'campaign-bindings.json');
    const output = join(f.root, 'campaign');
    this.manifest(manifest);
    writeFileSync(
      bindings,
      JSON.stringify({
        schemaVersion: 1,
        runner: cli,
        codexPath: f.executable,
        projects: { fixture: { path: f.repo, base: f.git('rev-parse', 'HEAD') } },
        tools: {},
      }),
    );
    return { f, manifest, bindings, output };
  }

  /** Writes a real goal without listing participants, commands, models or budgets. */
  private manifest(path: string): void {
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 3,
        modes: ['simulation'],
        cases: [
          {
            id: 'chain',
            project: 'fixture',
            prompt: 'Research the dependency chain',
            expectedOutcome: 'completed',
          },
        ],
      }),
    );
  }
}

const scenarios = new PromptCampaignScenarios();

test('prompt campaign reaches three dynamically activated owners through the task CLI', (t) =>
  scenarios.run(t));

test('prompt campaign rejects dirty source before creating execution state', (t) =>
  scenarios.dirty(t));

test('prompt campaign cancellation stops its managed task and preserves evidence', (t) =>
  scenarios.cancel(t));

test('prompt campaign validates all source bindings before materializing cases', (t) =>
  scenarios.invalidBindings(t));

test('prompt campaign retains unexpected outcomes as failures', (t) => scenarios.mismatch(t));

test('prompt campaign rejects supervising code mutation during execution', (t) =>
  scenarios.supervisor(t));

test('prompt campaign captures every case before executing the first', (t) =>
  scenarios.capturedInputs(t));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
