import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class QualificationTests {
  qualificationProgramExercisesProductionCLIAndRetainsImmutableCampaignEvidence_1(t: TestContext) {
    const f = campaign(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(report.status, 'passed');
    assert.equal(report.cases[0].report.outcome, 'ready_for_integration');
    assert.equal(report.cases[0].acceptance[0].exitCode, 0);
    assert.ok(report.runnerHash);
    assert.equal(report.runnerHash, report.finalRunnerHash);
    assert.equal(f.run().status, 2);
  }
  qualificationFailureStaysVisibleAndDoesNotRetryCases_2(t: TestContext) {
    const f = campaign(t, 'malformed');
    f.value.cases.push({ ...f.value.cases[0], id: 'second' });
    const r = f.run();
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(report.cases.length, 2);
    assert.ok(report.cases.every((c: any) => c.status === 'failed'));
    assert.equal(readFileSync(f.calls, 'utf8').trim().split('\n').length, 2);
  }
  qualificationRejectsNonImmutableRevisionsBeforeInference_3(t: TestContext) {
    const f = campaign(t);
    f.value.cases[0].base = 'HEAD';
    assert.equal(f.run().status, 2);
  }
  qualificationRecordsCorrectlyBlockedWorkOnlyAfterIndependentOwnerAcceptance_4(t: TestContext) {
    const f = campaign(t, 'blocked');
    f.value.cases[0].expectedOutcome = 'blocked';
    const check = join(f.root, 'boundary.mjs');
    writeFileSync(
      check,
      "import{readFileSync}from'node:fs';import assert from'node:assert/strict';const r=JSON.parse(readFileSync(process.argv[2]));assert.equal(r.requests[0].ownerId,'dependency');",
    );
    f.value.cases[0].acceptance = [
      { command: process.execPath, args: [check, '{report}'], artifacts: [check] },
    ];
    assert.equal(f.run().status, 0);
  }
  async campaignCancellationStopsItsActiveCLIAndRetainsPartialEvidence_5(t: TestContext) {
    const f = campaign(t, 'implementation-timeout'),
      manifest = join(f.root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify(f.value));
    const child = spawn(process.execPath, [program, manifest, f.output], {
      env: f.env,
      stdio: 'ignore',
    });
    t.after(() => child.kill('SIGKILL'));
    const exited = new Promise((resolve: any) => child.on('exit', (code: any) => resolve(code)));
    const deadline = Date.now() + 10000;
    while (!(
      existsSync(f.calls) && readFileSync(f.calls, 'utf8').includes('"stage":"implementation"')
    )) {
      assert.ok(Date.now() < deadline, 'CLI must reach implementation');
      await new Promise((r: any) => setTimeout(r, 30));
    }
    child.kill('SIGINT');
    assert.equal(await exited, 130);
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.equal(report.status, 'cancelled');
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].report.status, 'cancelled');
  }
  independentReportCheckerStillExecutesWhenItsSnapshotPathContainsSpaces_6(t: TestContext) {
    const f = workflowFixture(t),
      script = join(f.root, 'report check.mjs');
    writeFileSync(script, readFileSync('dist/experiments/checks/check-report-summary.js'));
    mkdirSync(join(f.repo, 'dist/report'), { recursive: true });
    writeFileSync(
      join(f.repo, 'dist/report/report.js'),
      "export function markdownReport(){return 'fixture without outcome'}",
    );
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: f.repo });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OUTCOME_SECTION_REQUIRED/);
  }
  campaignExposesActualPreparationFailureBeforeAnyModelRuns_7(t: TestContext) {
    const f = campaign(t),
      path = join(f.repo, 'architecture/environment.yaml'),
      environment = JSON.parse(String(readFileSync(path)));
    environment.setup = [{ command: process.execPath, args: ['-e', 'process.exit(19)'] }];
    writeFileSync(path, JSON.stringify(environment));
    f.commit();
    f.value.cases[0].base = f.git('rev-parse', 'HEAD');
    assert.equal(f.run().status, 1);
    const report = JSON.parse(String(readFileSync(join(f.output, 'campaign.json'))));
    assert.match(report.cases[0].error, /Command failed \(19\)/);
    assert.equal(existsSync(f.calls), false);
  }
}
const suite = new QualificationTests();

const program = resolve('scripts/qualify.mjs');
function campaign(t: any, mode: any = 'success'): any {
  const f = workflowFixture(t, mode),
    assignment = join(f.root, 'assignment.json'),
    manifest = join(f.root, 'manifest.json'),
    output = join(f.root, 'campaign');
  const check = prepareAcceptance(f, assignment);
  const value = campaignDefinition(f, assignment, check);
  const run = () => {
    writeFileSync(manifest, JSON.stringify(value));
    return spawnSync(process.execPath, [program, manifest, output], {
      env: f.env,
      encoding: 'utf8',
      timeout: 30000,
    });
  };
  return { ...f, value, run, output };
}
function campaignDefinition(f: any, assignment: string, check: string): any {
  return {
    schemaVersion: 1,
    runner: cli,
    codexPath: f.executable,
    cases: [
      {
        id: 'change',
        project: f.repo,
        base: f.git('rev-parse', 'HEAD'),
        component: 'sample',
        assignment,
        expectedOutcome: 'ready_for_integration',
        acceptance: [{ command: process.execPath, args: [check, '{report}'], artifacts: [check] }],
      },
    ],
  };
}
function prepareAcceptance(f: any, assignment: string): string {
  writeFileSync(
    assignment,
    JSON.stringify({
      schemaVersion: 1,
      objective: 'Improve behavior',
      kind: 'change',
      expectedOutcome: 'Verified change',
      acceptanceCriteria: ['Source is after'],
      hostChecks: [],
    }),
  );
  const check = join(f.root, 'acceptance.mjs');
  writeFileSync(
    check,
    "import{readFileSync}from'node:fs';import assert from'node:assert/strict';const r=JSON.parse(readFileSync(process.argv[2]));assert.equal(readFileSync(r.workspace+'/source.txt','utf8'),'after');",
  );
  return check;
}
test('qualification program exercises production CLI and retains immutable campaign evidence', (t: any) =>
  suite.qualificationProgramExercisesProductionCLIAndRetainsImmutableCampaignEvidence_1(t));
test('qualification failure stays visible and does not retry cases', (t: any) =>
  suite.qualificationFailureStaysVisibleAndDoesNotRetryCases_2(t));
test('qualification rejects non-immutable revisions before inference', (t: any) =>
  suite.qualificationRejectsNonImmutableRevisionsBeforeInference_3(t));
test('qualification records correctly blocked work only after independent owner acceptance', (t: any) =>
  suite.qualificationRecordsCorrectlyBlockedWorkOnlyAfterIndependentOwnerAcceptance_4(t));

test('campaign cancellation stops its active CLI and retains partial evidence', (t: any) =>
  suite.campaignCancellationStopsItsActiveCLIAndRetainsPartialEvidence_5(t));
test('independent report checker still executes when its snapshot path contains spaces', (t: any) =>
  suite.independentReportCheckerStillExecutesWhenItsSnapshotPathContainsSpaces_6(t));
test('campaign exposes actual preparation failure before any model runs', (t: any) =>
  suite.campaignExposesActualPreparationFailureBeforeAnyModelRuns_7(t));
