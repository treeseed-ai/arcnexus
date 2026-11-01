import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { materializeFixture } from '../../testing/support/fixture-payloads.js';
import { handoffFixture } from '../../testing/support/handoff-fixture.js';

/** Exercises workday experiments behavior through observable scenarios. */
class WorkdayExperimentsTests {
  /** Verifies that built experiment inspection captures both workday participants without inference. */
  builtExperimentInspectionCapturesBothWorkdayParticipantsWithoutInference(t: TestContext) {
    const f = handoffFixture(t);
    const campaign = new HandoffCampaign(f, 'completed');
    const result = campaign.inspect();
    assert.equal(result.status, 0, result.stderr);
    const captured = JSON.parse(result.stdout).cases[0];
    assert.equal(captured.workday.requester.resolved.componentId, 'sample');
    assert.equal(captured.workday.recipient.resolved.componentId, 'dependency');
    assert.ok(captured.workday.digest);
    assert.equal(existsSync(f.calls), false);
    assert.equal(existsSync(f.state), false);
  }

  /** Verifies that built experiment runs simulated workday through retained threads and independent checks. */
  builtExperimentRunsSimulatedWorkdayThroughRetainedThreadsAndIndependentChecks(t: TestContext) {
    const fixture = new SimulationCampaign(t);
    const result = fixture.run('campaign');
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    const campaign = fixture.report('campaign');
    assert.equal(campaign.status, 'passed');
    assert.equal(campaign.cases[0].report.evidenceMode, 'simulation');
    assert.ok(
      campaign.cases[0].report.assignments.every(
        (assignment: any) => assignment.evidenceMode === 'simulation',
      ),
    );
    assert.equal(fixture.git('status', '--porcelain'), '');
    fixture.breakContract();
    const bad = fixture.run('bad');
    assert.equal(bad.status, 2);
    assert.equal(existsSync(join(fixture.root, 'bad')), false);
  }

  /** Verifies that expected blocked workday checks only models that actually executed. */
  expectedBlockedWorkdayChecksOnlyModelsThatActuallyExecuted(t: TestContext) {
    const campaign = new HandoffCampaign(handoffFixture(t, 'unknown-owner'), 'blocked');
    const result = campaign.run();
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    const report = campaign.report();
    assert.equal(report.cases[0].status, 'passed');
    assert.ok(report.cases[0].report.assignments.some((assignment: any) => !assignment.threadId));
  }

  /** Verifies that real validator owner receives declared build and regression operations. */
  realValidatorOwnerReceivesDeclaredBuildAndRegressionOperations() {
    const r = spawnSync(
      process.execPath,
      [
        cli,
        'inspect',
        'guidance-validation',
        'Implement bounded validator behavior',
        '--project',
        process.cwd(),
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      JSON.parse(r.stdout)
        .operations.map((o: any) => o.id)
        .sort(),
      ['guidance-build', 'guidance-tests', 'guidance-validation-lint'],
    );
  }

  /** Verifies that guidance inspection preserves explicit writable skill directory grant. */
  guidanceInspectionPreservesExplicitWritableSkillDirectoryGrant() {
    const r = spawnSync(
      process.execPath,
      [
        cli,
        'inspect',
        'agent-guidance',
        'Maintain skill metadata',
        '--project',
        process.cwd(),
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    const owner = JSON.parse(r.stdout).context.find((c: any) => c.id === 'agent-guidance');
    assert.ok(owner.access.writeDirectories.includes('.agents/skills'));
  }
}

/** Exercises handoff campaign behavior through observable scenarios. */
class HandoffCampaign {
  private bindings: string;

  private manifest: string;

  private output: string;

  /** Writes a controlled workday campaign with explicit bindings and outcome acceptance. */
  constructor(
    private fixture: any,
    outcome: string,
  ) {
    this.bindings = join(fixture.root, 'bindings.json');
    this.manifest = join(fixture.root, 'experiment.json');
    this.output = join(fixture.root, 'output');
    this.writeBindings();
    writeFileSync(
      this.manifest,
      JSON.stringify({
        schemaVersion: 2,
        modes: ['live'],
        cases: [
          {
            id: outcome === 'blocked' ? 'blocked' : 'handoff',
            project: 'target',
            workday: fixture.manifest,
            expectedOutcome: outcome,
            acceptance: this.acceptance(outcome),
          },
        ],
      }),
    );
  }

  /** Writes machine-local bindings for the pinned fixture and supervising executable. */
  private writeBindings(): void {
    const fixture = this.fixture;
    writeFileSync(
      this.bindings,
      JSON.stringify({
        schemaVersion: 1,
        runner: cli,
        codexPath: fixture.executable,
        projects: { target: { path: fixture.repo, base: fixture.git('rev-parse', 'HEAD') } },
        tools: { node: process.execPath },
      }),
    );
  }

  /** Creates an external owner-request assertion for blocked cases and a success check otherwise. */
  private acceptance(outcome: string) {
    if (outcome !== 'blocked')
      return [{ command: 'node', args: ['-e', 'process.exit(0)'], artifacts: [] }];
    const check = join(this.fixture.root, 'blocked.cjs');
    writeFileSync(
      check,
      "const r=require(process.argv[2]);if(r.status!=='blocked'||!r.assignments.some(a=>a.requests?.some(q=>q.ownerId==='unknown')))process.exit(1)",
    );
    return [{ command: 'node', args: [check, '{report}'], artifacts: [check] }];
  }

  /** Resolves the requested view without modifying candidate source. */
  inspect() {
    return this.invoke('inspect', '--json');
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run() {
    return this.invoke('run', '--mode', 'live', '--output', this.output);
  }

  /** Reads the retained campaign projection for outcome assertions. */
  report(): any {
    return JSON.parse(readFileSync(join(this.output, 'campaign.json'), 'utf8'));
  }

  /** Spawns the built experiment CLI with explicit fixture bindings and test cancellation bounds. */
  private invoke(command: string, ...args: string[]) {
    return spawnSync(
      process.execPath,
      [cli, 'experiment', command, this.manifest, '--bindings', this.bindings, ...args],
      { encoding: 'utf8', env: this.fixture.env, timeout: 30 * 60 * 1000 },
    );
  }
}

/** Exercises simulation campaign behavior through observable scenarios. */
class SimulationCampaign {
  readonly root = mkdtempSync(join(tmpdir(), 'arcnexus-workday-experiment-'));

  private repo = join(this.root, 'repo');

  private bindings = join(this.root, 'bindings.json');

  /** Materializes and commits the workday simulation fixture, then writes pinned local bindings. */
  constructor(t: TestContext) {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    materializeFixture('workday', this.repo);
    this.git('init', '-q');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.invalid');
    this.git('add', '.');
    this.git('commit', '-qm', 'fixture');
    this.writeBindings();
  }

  /** Runs Git against the fixture repository and propagates command failures. */
  git(...args: string[]): string {
    const result = spawnSync('git', ['-C', this.repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  /** Writes machine-local bindings for the pinned fixture and supervising executable. */
  private writeBindings(): void {
    writeFileSync(
      this.bindings,
      JSON.stringify({
        schemaVersion: 1,
        runner: cli,
        projects: { fixture: { path: this.repo, base: this.git('rev-parse', 'HEAD') } },
        tools: { node: process.execPath },
      }),
    );
  }

  /** Commits an incompatible fixture contract and refreshes its pinned binding revision. */
  breakContract(): void {
    writeFileSync(join(this.repo, 'workday-contract.yaml'), '{}');
    this.git('add', '.');
    this.git('commit', '-qm', 'incompatible');
    this.writeBindings();
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(name: string) {
    return spawnSync(
      process.execPath,
      [
        cli,
        'experiment',
        'run',
        resolve('experiments/workday-simulation.yaml'),
        '--bindings',
        this.bindings,
        '--mode',
        'simulation',
        '--output',
        join(this.root, name),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, ARCNEXUS_STATE_DIR: join(this.root, 'state') },
        timeout: 30 * 60 * 1000,
      },
    );
  }

  /** Reads the retained campaign projection for outcome assertions. */
  report(name: string): any {
    return JSON.parse(readFileSync(join(this.root, name, 'campaign.json'), 'utf8'));
  }
}

const suite = new WorkdayExperimentsTests();

const cli = resolve('dist/cli.js');

test('built experiment inspection captures both workday participants without inference', (t: any) =>
  suite.builtExperimentInspectionCapturesBothWorkdayParticipantsWithoutInference(t));

test('built experiment runs simulated workday through retained threads and independent checks', (t: any) =>
  suite.builtExperimentRunsSimulatedWorkdayThroughRetainedThreadsAndIndependentChecks(t));

test('expected blocked workday checks only models that actually executed', (t: any) =>
  suite.expectedBlockedWorkdayChecksOnlyModelsThatActuallyExecuted(t));

test('real validator owner receives declared build and regression operations', () =>
  suite.realValidatorOwnerReceivesDeclaredBuildAndRegressionOperations());

test('guidance inspection preserves explicit writable skill-directory grant', () =>
  suite.guidanceInspectionPreservesExplicitWritableSkillDirectoryGrant());

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
