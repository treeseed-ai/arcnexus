import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class ContextTests {
  boundCommandExecutesFromSuppliedContextWithResetPATHAndReadOnlyToolVisibility_1(t: TestContext) {
    const f = workflowFixture(t),
      bin = join(f.root, 'tool directory');
    mkdirSync(bin);
    const tool = join(bin, 'target-node');
    writeFileSync(tool, '#!/bin/sh\nexec ' + process.execPath + ' "$@"\n', { mode: 0o755 });
    writeFileSync(
      join(f.repo, 'verify.cjs'),
      readFileSync(join(f.repo, 'verify.cjs'), 'utf8') +
        "if(require('child_process').spawnSync('target-node',['-e','process.exit(0)']).status!==0)throw new Error('NESTED_TOOL_UNAVAILABLE');",
    );
    f.component.verification[0].command = 'target-node';
    writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(f.component));
    f.commit();
    const binding = join(f.root, 'bindings.json');
    writeFileSync(
      binding,
      JSON.stringify({ schemaVersion: 1, repositories: {}, tools: { 'target-node': tool } }),
    );
    f.configure({ suppliedTool: true });
    const r = f.run('--kind', 'research', '--bindings', binding);
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    assert.equal(record.settings.filesystem[bin], 'read');
    assert.ok(calls(f)[0].prompt.includes(tool));
    assert.ok(calls(f)[0].args.some((a: any) => a.includes(JSON.stringify(bin) + '="read"')));
  }
  reviewReceivesFirstParentDiffWithHashNoUnrelatedHistory_2(t: TestContext) {
    const f = workflowFixture(t);
    writeFileSync(join(f.repo, 'docs/behavior.md'), 'PINNED_REVIEW_CHANGE');
    f.commit();
    const r = f.run('--kind', 'review');
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout),
      prompt = calls(f)[0].prompt;
    assert.match(prompt, /PINNED_REVIEW_CHANGE/);
    assert.match(prompt, /Host review evidence/);
    assert.equal(record.turns[0].reviewEvidence.basis, 'base-first-parent');
    assert.match(record.turns[0].reviewEvidence.sha256, /^[a-f0-9]{64}$/);
  }
  rootRevisionReviewAndCandidateReviewBothReceiveReadableChanges_3(t: TestContext) {
    for (const kind of ['review', 'change']) {
      const f = workflowFixture(t),
        r = f.run('--kind', kind);
      assert.equal(r.status, 0, r.stderr);
      const p = calls(f).at(-1).prompt;
      assert.match(p, /Host review evidence/);
      assert.match(p, kind === 'review' ? /Own sample behavior/ : /BOUNDARY_EXPECTED/);
    }
  }
  revisionReviewEvidenceExcludesPathsOutsideDeclaredReadAuthority_4(t: TestContext) {
    const f = workflowFixture(t);
    f.component.access = { readPaths: ['docs'], writeDirectories: ['docs', 'tests'] };
    f.component.allowedWritePaths = ['docs', 'tests'];
    writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(f.component));
    f.commit();
    writeFileSync(join(f.repo, 'source.txt'), 'SECRET_OUTSIDE_READ_SCOPE');
    writeFileSync(join(f.repo, 'docs/behavior.md'), 'VISIBLE_CHANGE');
    f.commit();
    const r = f.run('--kind', 'review');
    assert.equal(r.status, 0, r.stderr);
    const prompt = calls(f)[0].prompt;
    assert.match(prompt, /VISIBLE_CHANGE/);
    assert.doesNotMatch(prompt, /SECRET_OUTSIDE_READ_SCOPE/);
  }
  specificationDelegatesUnavailableSandboxChecksToTheAuthoritativeHost_5(t: TestContext) {
    const f = workflowFixture(t);
    f.configure({ sandboxFeedback: true });
    const r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.outcome, 'ready_for_integration');
    assert.ok(report.commands.some((c: any) => c.exitCode === 1));
    assert.ok(report.regressionCheckpoint.outputIncludes === 'BOUNDARY_EXPECTED');
  }
  specificationExposesBothRequiredSourceChangesInTheActualTurnPrompt_6(t: TestContext) {
    const f = workflowFixture(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const prompt = calls(f).find((c: any) => c.stage === 'specification').prompt;
    assert.match(prompt, /actual edit to at least one.*documentation/);
    assert.match(prompt, /host rejects this checkpoint if either kind of change is missing/);
  }
  documentationOnlySpecificationRequiresRealDocumentationEditsThroughTheBuiltCLI_7(t: TestContext) {
    const f = workflowFixture(t),
      assignment = join(f.root, 'documentation.json');
    this.documentationAssignment(assignment);
    f.configure({ documentationOnly: true });
    const r = spawnSync(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        '--assignment',
        assignment,
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
      ],
      { encoding: 'utf8', env: f.env, timeout: 30 * 60 * 1000 },
    );
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(
      report.changes.map((c: any) => c.path),
      ['docs/behavior.md'],
    );
    assert.ok(!report.commands.some((c: any) => c.stage === 'red-test'));
    assert.equal(report.status, 'completed');
  }
  private documentationAssignment(assignment: string): void {
    writeFileSync(
      assignment,
      JSON.stringify({
        schemaVersion: 1,
        kind: 'change',
        changeType: 'documentation',
        objective: 'Update documentation',
        expectedOutcome: 'Updated docs',
        acceptanceCriteria: ['Updated documentation'],
        hostChecks: [],
      }),
    );
  }
}
const suite = new ContextTests();

const calls = (f: any) =>
  readFileSync(f.calls, 'utf8')
    .trim()
    .split('\n')
    .map((line: string) => JSON.parse(line));
test('bound command executes from supplied context with reset PATH and read-only tool visibility', (t: any) =>
  suite.boundCommandExecutesFromSuppliedContextWithResetPATHAndReadOnlyToolVisibility_1(t));
test('review receives first-parent diff with hash, no unrelated history', (t: any) =>
  suite.reviewReceivesFirstParentDiffWithHashNoUnrelatedHistory_2(t));
test('root revision review and candidate review both receive readable changes', (t: any) =>
  suite.rootRevisionReviewAndCandidateReviewBothReceiveReadableChanges_3(t));
test('revision review evidence excludes paths outside declared read authority', (t: any) =>
  suite.revisionReviewEvidenceExcludesPathsOutsideDeclaredReadAuthority_4(t));
test('specification delegates unavailable sandbox checks to the authoritative host', (t: any) =>
  suite.specificationDelegatesUnavailableSandboxChecksToTheAuthoritativeHost_5(t));
test('specification exposes both required source changes in the actual turn prompt', (t: any) =>
  suite.specificationExposesBothRequiredSourceChangesInTheActualTurnPrompt_6(t));

test('documentation-only specification requires real documentation edits through the built CLI', (t: any) =>
  suite.documentationOnlySpecificationRequiresRealDocumentationEditsThroughTheBuiltCLI_7(t));
