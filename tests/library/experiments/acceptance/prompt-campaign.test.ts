import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
    const child = new TestProcess(
      t,
      [
        cli,
        'experiment',
        'run',
        manifest,
        '--bindings',
        bindings,
        '--mode',
        'simulation',
        '--output',
        output,
      ],
      f.env,
    );
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

  /** Invokes the assembled CLI with the same external watchdog and output capture for each case. */
  private execute({
    f,
    manifest,
    bindings,
    output,
  }: ReturnType<PromptCampaignScenarios['fixture']>) {
    return spawnSync(
      process.execPath,
      [
        cli,
        'experiment',
        'run',
        manifest,
        '--bindings',
        bindings,
        '--mode',
        'simulation',
        '--output',
        output,
      ],
      { encoding: 'utf8', env: f.env, timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
    );
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

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
