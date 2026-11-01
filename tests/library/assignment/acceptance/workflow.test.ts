import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises workflow behavior through observable scenarios. */
class WorkflowTests {
  /** Verifies that built cliperforms three checked turns on one thread. */
  builtCLIPerformsThreeCheckedTurnsOnOneThread(t: TestContext) {
    const f = workflowFixture(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.outcome, 'ready_for_integration');
    assert.deepEqual(
      v.turns.map((x: any) => x.activity),
      ['specification', 'implementation', 'review'],
    );
    assert.equal(v.implementationAttempts, 1);
    assert.equal(v.usage.input_tokens, 30);
    assert.equal(readFileSync(join(v.workspace, 'source.txt'), 'utf8'), 'after');
    assert.ok(existsSync(join(f.state, 'runs', v.id, 'activities.jsonl')));
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    assert.ok(calls[1].args.includes('resume'));
    assert.ok(calls[2].args.includes('workflow-thread'));
  }

  /** Verifies the scenario completes read only assignment. */
  completesReadOnlyAssignment(t: TestContext, kind: any) {
    const f = workflowFixture(t),
      r = f.run('--kind', kind);
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.outcome, kind + '_completed');
    assert.equal(v.changes.length, 0);
    assert.equal(v.turns.length, 1);
  }

  /** Verifies the scenario rejects invalid workflow result. */
  rejectsInvalidWorkflowResult(t: TestContext, mode: any) {
    const f = workflowFixture(t, mode),
      r = f.run('--max-attempts', '2');
    assert.equal(r.status, 1, r.stderr);
    assert.notEqual(JSON.parse(r.stdout).status, 'completed');
  }

  /** Late failure diagnostics reach the corrective turn through the real SDK boundary. */
  lateFailureReachesCorrection(t: TestContext): void {
    const f = workflowFixture(t, 'repair');
    const verify = join(f.repo, 'verify.cjs');
    const original = readFileSync(verify, 'utf8');
    writeFileSync(verify, "require('fs').writeSync(1,'passing output\\n'.repeat(12000));" +
      "if(require('fs').readFileSync('source.txt','utf8')==='broken')throw new Error('LATE_ACTUAL_FAILURE');" + original);
    f.configure({ requiredFeedback: 'LATE_ACTUAL_FAILURE' });
    f.commit();
    const result = f.run('--max-attempts', '2');
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(f.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const correction = calls.find(call => call.stage === 'correction');
    assert.match(correction.prompt, /LATE_ACTUAL_FAILURE/);
    assert.match(correction.prompt, /Full retained log:/);
  }

  /** Verifies that genuine repair is opt in and preserves frozen tests and cumulative usage. */
  genuineRepairIsOptInAndPreservesFrozenTestsAndCumulativeUsage(t: TestContext) {
    const f = workflowFixture(t, 'repair'),
      r = f.run('--max-attempts', '2');
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.deepEqual(
      v.turns.map((x: any) => x.activity),
      ['specification', 'implementation', 'correction', 'review'],
    );
    assert.equal(v.implementationAttempts, 2);
    assert.equal(v.usage.input_tokens, 40);
    assert.deepEqual(
      v.turns.map((x: any) => x.usage.input_tokens),
      [10, 10, 10, 10],
    );
  }

  /** Verifies that explicit failure stops and failed correction exhausts two attempts. */
  explicitFailureStopsAndFailedCorrectionExhaustsTwoAttempts(t: TestContext) {
    for (const [mode, args, turns] of [
      ['repair', ['--max-attempts', '1'], 2],
      ['exhaust', ['--max-attempts', '2'], 3],
    ] as Array<[string, string[], number]>) {
      const f = workflowFixture(t, mode),
        r = f.run(...args);
      assert.equal(r.status, 1);
      assert.equal(JSON.parse(r.stdout).turns.length, turns);
    }
  }

  /** Verifies that review can request one corrective pass within five turns. */
  reviewCanRequestOneCorrectivePassWithinFiveTurns(t: TestContext) {
    const f = workflowFixture(t, 'review-repair'),
      r = f.run('--max-attempts', '2');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).turns.length, 5);
  }

  /** Verifies that a weakened current test cannot replace frozen acceptance. */
  aWeakenedCurrentTestCannotReplaceFrozenAcceptance(t: TestContext) {
    const f = workflowFixture(t, 'weak-test'),
      r = f.run('--max-attempts', '1');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Command failed/);
  }

  /** Verifies that blocked work returns avalidated owner request. */
  blockedWorkReturnsAValidatedOwnerRequest(t: TestContext) {
    const f = workflowFixture(t, 'blocked'),
      r = f.run();
    assert.equal(r.status, 1);
    const v = JSON.parse(r.stdout);
    assert.equal(v.outcome, 'blocked');
    assert.equal(v.requests[0].ownerId, 'dependency');
    assert.equal(v.turns.length, 1);
  }

  /** Verifies that unchanged change assignment is explicitly no changes. */
  unchangedChangeAssignmentIsExplicitlyNoChanges(t: TestContext) {
    const f = workflowFixture(t, 'no-changes'),
      r = f.run();
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).outcome, 'no_changes');
  }

  /** Verifies the scenario preserves git change evidence. */
  preservesGitChangeEvidence(t: TestContext, mode: any) {
    const f = workflowFixture(t, mode),
      r = f.run();
    assert.equal(r.status, 1);
    const v = JSON.parse(r.stdout);
    assert.ok(v.stagedChanges.some((c: any) => c.path === 'source.txt'));
    if (mode === 'rename') {
      assert.ok(v.changes.some((c: any) => c.path === 'new.txt'));
      assert.ok(v.changes.some((c: any) => c.kind === 'D'));
    } else assert.ok(v.unstagedChanges.some((c: any) => c.path === 'source.txt'));
    assert.notEqual(v.outcome, 'no_changes');
  }

  /** Verifies that frozen test restoration refuses aredirected file without overwriting its target. */
  async frozenTestRestorationRefusesARedirectedFileWithoutOverwritingItsTarget(t: TestContext) {
    const { withFrozenTests } = await import('../../../../dist/library/assignment/checkpoints.js');
    const { digest } = await import('../../../../dist/library/architecture/assignment.js');
    const { writeFileSync, unlinkSync, symlinkSync } = await import('node:fs');
    const f = workflowFixture(t),
      path = join(f.repo, 'tests/frozen.cjs'),
      precious = join(f.root, 'precious');
    writeFileSync(path, 'original');
    writeFileSync(precious, 'keep');
    const record = { workspace: f.repo, base: f.git('rev-parse', 'HEAD') } as any;
    const bytes = Buffer.from('frozen');
    await assert.rejects(
      withFrozenTests(
        record,
        [{ path: 'tests/frozen.cjs', content: bytes.toString('base64'), sha256: digest(bytes) }],
        async () => {
          unlinkSync(path);
          symlinkSync(precious, path);
        },
      ),
      /Symlink/,
    );
    assert.equal(readFileSync(precious, 'utf8'), 'keep');
  }

  /** Verifies that candidate guidance cannot authorize edits outside captured scope. */
  candidateGuidanceCannotAuthorizeEditsOutsideCapturedScope(t: TestContext) {
    const f = workflowFixture(t);
    f.component.allowedWritePaths.push('AGENTS.md');
    writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(f.component));
    f.commit();
    f.configure({ guidanceExpansion: true });
    const r = f.run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /scope/i);
  }
}

const suite = new WorkflowTests();

test('built CLI performs three checked turns on one thread', (t: any) =>
  suite.builtCLIPerformsThreeCheckedTurnsOnOneThread(t));

for (const kind of ['research', 'review'])
  test(`${kind} succeeds without edits`, (t: any) => suite.completesReadOnlyAssignment(t, kind));

for (const mode of [
  'early-implementation',
  'wrong-red',
  'scope',
  'ignored',
  'commit',
  'symlink',
  'staged-scope',
  'masked-symlink',
  'review-write',
  'malformed',
  'unknown-owner',
])
  test(`host rejects ${mode}`, (t: any) => suite.rejectsInvalidWorkflowResult(t, mode));

test('genuine repair is opt-in and preserves frozen tests and cumulative usage', (t: any) =>
  suite.genuineRepairIsOptInAndPreservesFrozenTestsAndCumulativeUsage(t));

test('explicit attempt limits stop failed implementation and correction', (t: any) =>
  suite.explicitFailureStopsAndFailedCorrectionExhaustsTwoAttempts(t));

test('review can request one corrective pass within five turns', (t: any) =>
  suite.reviewCanRequestOneCorrectivePassWithinFiveTurns(t));

test('a weakened current test cannot replace frozen acceptance', (t: any) =>
  suite.aWeakenedCurrentTestCannotReplaceFrozenAcceptance(t));

test('blocked work returns a validated owner request', (t: any) =>
  suite.blockedWorkReturnsAValidatedOwnerRequest(t));

test('unchanged change assignment is explicitly no_changes', (t: any) =>
  suite.unchangedChangeAssignmentIsExplicitlyNoChanges(t));

for (const mode of ['rename', 'index-only'])
  test(`Git evidence preserves ${mode}`, (t: any) => suite.preservesGitChangeEvidence(t, mode));

test('frozen-test restoration refuses a redirected file without overwriting its target', (t: any) =>
  suite.frozenTestRestorationRefusesARedirectedFileWithoutOverwritingItsTarget(t));

test('candidate guidance cannot authorize edits outside captured scope', (t: any) =>
  suite.candidateGuidanceCannotAuthorizeEditsOutsideCapturedScope(t));

test('late host diagnostics reach the corrective steward', (t) => suite.lateFailureReachesCorrection(t));

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
