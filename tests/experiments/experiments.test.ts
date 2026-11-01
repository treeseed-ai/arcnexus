import { materializeFixture } from '../development-tooling/fixture-payloads.js';
import { TestProcess, waitFor } from '../development-tooling/test-process.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { parse } from 'yaml';
class ExperimentsTests {
  builtExperimentInspectResolvesPinnedCasesWithoutWorkspacesOrInference_1(t: TestContext) {
    const f = fixture(t),
      r = f.run('inspect', f.manifest, '--bindings', f.bindings, '--json');
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.cases.length, 4);
    assert.equal(d.cases[0].base, f.base);
    assert.ok(d.digest);
    assert.equal(existsSync(f.state), false);
  }
  experimentRunRequiresExplicitModeAndRejectsIncompatibleFixture_2(t: TestContext) {
    const f = fixture(t);
    assert.equal(f.run('run', f.manifest, '--bindings', f.bindings).status, 2);
    writeFileSync(join(f.repo, 'source.txt'), 'different');
    f.git('add', '.');
    f.git('commit', '-qm', 'changed');
    f.value.projects.fixture.base = f.git('rev-parse', 'HEAD');
    writeFileSync(f.bindings, JSON.stringify(f.value));
    const r = f.runCampaign();
    assert.equal(r.status, 2);
    assert.match(r.stderr, /fixture contract/i);
    assert.equal(existsSync(f.output), false);
  }
  simulationUsesProductionSDKWorkflowAndLabelsSuccessRepairBoundaryAndFailure_3(t: TestContext) {
    const f = fixture(t),
      r = f.runCampaign();
    assert.equal(r.status, 1, r.stderr);
    const c = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(c.evidenceMode, 'simulation');
    assert.deepEqual(
      c.cases.map((c: any) => c.status),
      ['passed', 'passed', 'passed', 'failed'],
    );
    assert.equal(c.cases[1].report.implementationAttempts, 2);
    assert.ok(c.cases[0].report.plan);
    assert.ok(readFileSync(join(f.output, 'campaign.md'), 'utf8').includes('simulation'));
    assert.equal(c.runnerHash, c.finalRunnerHash);
    assert.equal(f.git('status', '--porcelain'), '');
    assert.equal(f.git('rev-parse', 'HEAD'), f.base);
    assert.equal(f.runCampaign().status, 2);
  }
  omittedAttempts(t: TestContext): void {
    const f = fixture(t);
    const data = parse(readFileSync(f.manifest, 'utf8'));
    const value = {
      ...data.cases[0],
      assignment: resolve('experiments/assignments/simulation.yaml'),
      acceptance: [
        {
          command: 'node',
          args: [resolve('dist/experiments/checks/simulation.js'), '{report}', 'success'],
          artifacts: [resolve('dist/experiments/checks/simulation.js')],
        },
      ],
    };
    delete value.maxAttempts;
    data.cases = [value];
    const manifest = join(f.root, 'unlimited.json');
    writeFileSync(manifest, JSON.stringify(data));
    const result = f.runCampaign(manifest);
    assert.equal(result.status, 0, result.stderr);
    const campaign = JSON.parse(readFileSync(join(f.output, 'campaign.json'), 'utf8'));
    assert.equal(campaign.cases[0].report.executionLimits.maxAttempts, null);
  }
  experimentRejectsMissingBindingsAndUnpinnedRevisionsBeforeCreatingOutput_4(t: TestContext) {
    const f = fixture(t);
    for (const projects of [{}, { fixture: { path: f.repo, base: 'HEAD' } }]) {
      f.value.projects = projects;
      writeFileSync(f.bindings, JSON.stringify(f.value));
      assert.equal(f.runCampaign().status, 2);
      assert.equal(existsSync(f.output), false);
    }
  }
  allAcceptanceInputsAreCapturedBeforeTheFirstCaseExecutes_5(t: TestContext) {
    const f = fixture(t),
      path = join(f.root, 'check.mjs');
    writeFileSync(
      path,
      "import{writeFileSync}from'node:fs';import{join}from'node:path';writeFileSync(join(process.argv[2],'check.mjs'),'process.exit(19)');",
    );
    const data = parse(readFileSync(f.manifest, 'utf8'));
    const c = {
      ...data.cases[0],
      assignment: resolve('experiments/assignments/simulation.yaml'),
      acceptance: [{ command: 'node', args: [path, f.root], artifacts: [path] }],
    };
    data.cases = [c, { ...c, id: 'second' }];
    const manifest = join(f.root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify(data));
    const r = f.runCampaign(manifest);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path, 'utf8'), 'process.exit(19)');
    assert.ok(
      JSON.parse(String(readFileSync(join(f.output, 'campaign.json')))).cases.every(
        (c: any) => c.status === 'passed',
      ),
    );
  }
  async changedSupervisorInvalidatesCampaignBeforeAnotherCase_6(
    t: TestContext,
    artifact = 'dist/report.js',
  ) {
    const f = fixture(t),
      runner = await this.copySupervisor(f);
    const check = join(f.root, 'mutate.mjs');
    this.supervisorMutation(check);
    const data = parse(readFileSync(f.manifest, 'utf8')),
      c = {
        ...data.cases[0],
        assignment: resolve('experiments/assignments/simulation.yaml'),
        acceptance: [
          {
            command: 'node',
            args: [check, join(runner, artifact)],
            artifacts: [check],
          },
        ],
      };
    data.cases = [c, { ...c, id: 'second' }];
    const manifest = join(f.root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify(data));
    const r = f.runCampaign(manifest);
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(report.cases.length, 1);
    assert.match(report.error, /Supervising build changed/);
    assert.notEqual(report.runnerHash, report.finalRunnerHash);
  }
  private supervisorMutation(check: string): void {
    writeFileSync(
      check,
      "import{appendFileSync}from'node:fs';appendFileSync(process.argv[2],'\\n// changed supervisor\\n');",
    );
  }

  private async copySupervisor(f: ExperimentFixture): Promise<string> {
    const { symlinkSync } = await import('node:fs');
    const runner = join(f.root, 'supervisor');
    for (const name of ['dist', 'schemas', '.fixture-build', 'fixtures/simulation'])
      if (existsSync(name)) cpSync(name, join(runner, name), { recursive: true });
    for (const name of ['package.json', 'package-lock.json']) cpSync(name, join(runner, name));
    symlinkSync(resolve('node_modules'), join(runner, 'node_modules'), 'dir');
    f.value.runner = join(runner, 'dist/cli.js');
    writeFileSync(f.bindings, JSON.stringify(f.value));
    return runner;
  }
  async scenario_7(t: TestContext, signal: NodeJS.Signals) {
    const f = fixture(t),
      marker = join(f.root, 'pid'),
      check = join(f.root, 'wait.mjs');
    const manifest = this.waitingAcceptance(f, check, marker);
    const child = new TestProcess(t, [cli, 'experiment', ...f.campaignArgs(manifest)], {
      ...process.env,
      ARCNEXUS_STATE_DIR: f.state,
    });
    await waitFor(() => existsSync(marker), 'Acceptance must start', 30000);
    const pid = Number(readFileSync(marker));
    child.kill(signal);
    const code = await child.closed;
    if (signal === 'SIGINT') assert.equal(code, 130);
    await waitFor(
      () => !existsSync('/proc/' + pid),
      'Acceptance must stop after parent loss',
      5000,
    );
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(report.status, signal === 'SIGINT' ? 'cancelled' : 'running');
    assert.ok(existsSync(join(f.output, 'success/report.json')));
  }
  private waitingAcceptance(f: ExperimentFixture, check: string, marker: string): string {
    writeFileSync(
      check,
      "import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000);",
    );
    const data = parse(readFileSync(f.manifest, 'utf8'));
    data.cases = [
      {
        ...data.cases[0],
        assignment: resolve('experiments/assignments/simulation.yaml'),
        acceptance: [{ command: 'node', args: [check, marker], artifacts: [check] }],
      },
    ];
    const manifest = join(f.root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify(data));
    return manifest;
  }
}
const suite = new ExperimentsTests();

const cli = resolve('dist/cli.js');
function fixture(t: TestContext): ExperimentFixture {
  return new ExperimentFixture(t);
}
class ExperimentFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'arcnexus-experiment-'));
  readonly repo = join(this.root, 'repo');
  readonly state = join(this.root, 'state');
  readonly output = join(this.root, 'campaign');
  readonly bindings = join(this.root, 'bindings.json');
  readonly manifest = resolve('experiments/simulation.yaml');
  readonly base: string;
  readonly value: any;
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
  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  run(...args: string[]) {
    return spawnSync(process.execPath, [cli, 'experiment', ...args], {
      env: { ...process.env, ARCNEXUS_STATE_DIR: this.state },
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    });
  }
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
  runCampaign(manifest = this.manifest) {
    return this.run(...this.campaignArgs(manifest));
  }
}
test('built experiment inspect resolves pinned cases without workspaces or inference', (t: any) =>
  suite.builtExperimentInspectResolvesPinnedCasesWithoutWorkspacesOrInference_1(t));
test('experiment run requires explicit mode and rejects incompatible fixture', (t: any) =>
  suite.experimentRunRequiresExplicitModeAndRejectsIncompatibleFixture_2(t));
test('simulation uses production SDK workflow and labels success repair boundary and failure', (t: any) =>
  suite.simulationUsesProductionSDKWorkflowAndLabelsSuccessRepairBoundaryAndFailure_3(t));
test('experiment rejects missing bindings and unpinned revisions before creating output', (t: any) =>
  suite.experimentRejectsMissingBindingsAndUnpinnedRevisionsBeforeCreatingOutput_4(t));
test('all acceptance inputs are captured before the first case executes', (t: any) =>
  suite.allAcceptanceInputsAreCapturedBeforeTheFirstCaseExecutes_5(t));
test('changed supervisor invalidates campaign before another case', (t: any) =>
  suite.changedSupervisorInvalidatesCampaignBeforeAnotherCase_6(t));
for (const signal of ['SIGINT', 'SIGKILL'] as const)
  test(`experiment ${signal} stops managed acceptance and preserves evidence`, (t: any) =>
    suite.scenario_7(t, signal));

test('experiment without an attempt limit preserves the unset runtime limit', (t) =>
  suite.omittedAttempts(t));

test('changed packaged schema invalidates the supervising build', (t) =>
  suite.changedSupervisorInvalidatesCampaignBeforeAnotherCase_6(
    t,
    'dist/architecture/schemas/component-v4.json',
  ));
