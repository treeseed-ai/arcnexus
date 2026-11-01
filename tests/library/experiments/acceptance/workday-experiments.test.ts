import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
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
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, String(r.error ?? r.stderr));
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
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, String(r.error ?? r.stderr));
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

const suite = new WorkdayExperimentsTests();

const cli = resolve('dist/cli.js');

test('built experiment inspection captures both workday participants without inference', (t: any) =>
  suite.builtExperimentInspectionCapturesBothWorkdayParticipantsWithoutInference(t));

test('real validator owner receives declared build and regression operations', () =>
  suite.realValidatorOwnerReceivesDeclaredBuildAndRegressionOperations());

test('guidance inspection preserves explicit writable skill-directory grant', () =>
  suite.guidanceInspectionPreservesExplicitWritableSkillDirectoryGrant());

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
