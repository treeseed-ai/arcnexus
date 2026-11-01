import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { operationFixture } from '../../testing/support/operations-fixture.js';
import { cli, stewardEntry } from '../../testing/support/workflow-fixture.js';

/** Exercises prior evidence behavior through observable scenarios. */
class PriorEvidenceTests {
  /** Verifies that built clisnapshots selected historical text before setup and supplies identical inspected context. */
  builtCLISnapshotsSelectedHistoricalTextBeforeSetupAndSuppliesIdenticalInspectedContext(
    t: TestContext,
  ) {
    const f = operationFixture(t),
      a = assignment(f);
    this.replaceHistoryDuringSetup(f, a.history);
    const inspected = invoke(f, a, 'inspect');
    assert.equal(inspected.status, 0, inspected.stderr);
    const r = invoke(f, a);
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout),
      resolved = JSON.parse(inspected.stdout);
    assert.equal(record.resolvedAssignment.digest, resolved.digest);
    assert.match(record.resolvedAssignment.priorEvidence[0].content, /PRIOR_FINDING_42/);
    assert.equal(
      record.resolvedAssignment.priorEvidence[0].bytes,
      Buffer.byteLength('PRIOR_FINDING_42: verify boundaries.'),
    );
    const dir = join(f.state, 'runs', record.id);
    assert.match(readFileSync(join(dir, 'prior-evidence/0.txt'), 'utf8'), /PRIOR_FINDING_42/);
    assert.match(readFileSync(f.calls, 'utf8'), /Historical evidence.*PRIOR_FINDING_42/);
    assert.equal(record.reusableFindings[0].componentId, 'sample');
    assert.equal(record.changes.length, 0);
    assert.match(readFileSync(join(dir, 'timeline.jsonl'), 'utf8'), /workspace.prepared/);
  }

  /** Verifies that replace history during setup. */
  private replaceHistoryDuringSetup(f: any, history: string): void {
    const envPath = join(f.repo, 'architecture/environment.yaml'),
      env = JSON.parse(String(readFileSync(envPath)));
    env.setup = [
      {
        command: process.execPath,
        args: ['-e', `require('fs').writeFileSync(${JSON.stringify(history)},'REPLACED')`],
      },
    ];
    writeFileSync(envPath, JSON.stringify(env));
    f.commit();
  }

  /** Verifies the scenario rejects invalid historical input. */
  rejectsInvalidHistoricalInput(t: TestContext, mode: any) {
    const f = operationFixture(t),
      a = assignment(f);
    if (mode === 'missing') a.value.priorEvidence[0].path += '.missing';
    if (mode === 'oversized') writeFileSync(a.history, 'x'.repeat(65537));
    if (mode === 'non-text') writeFileSync(a.history, Buffer.from([255, 0]));
    if (mode === 'duplicate') a.value.priorEvidence.push(a.value.priorEvidence[0]);
    if (mode === 'version-one') a.value.schemaVersion = 1;
    writeFileSync(a.path, JSON.stringify(a.value));
    const r = invoke(f, a);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, '');
  }

  /** Verifies that built inspect exposes focused report regression alongside full repository verification. */
  builtInspectExposesFocusedReportRegressionAlongsideFullRepositoryVerification() {
    const r = spawnSync(
      process.execPath,
      [cli, 'inspect', 'report', 'Improve evidence', '--project', process.cwd(), '--json'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, String(r.error ?? r.stderr));
    const commands = JSON.parse(r.stdout).verification;
    assert.ok(commands.some((c: any) => c.command === 'npm' && c.args.join(' ') === 'test'));
    assert.ok(
      commands.some((c: any) => c.command === 'npm' && c.args.join(' ') === 'run test:report'),
      'focused report regression is captured',
    );
  }
}

const suite = new PriorEvidenceTests();

function assignment(f: any): any {
  const history = join(f.root, 'finding.txt'),
    path = join(f.root, 'assignment.json');
  writeFileSync(history, 'PRIOR_FINDING_42: verify boundaries.');
  const value = {
    schemaVersion: 2,
    kind: 'research',
    objective: 'Inspect prior finding',
    expectedOutcome: 'Evidence-backed conclusion',
    acceptanceCriteria: ['Explain finding'],
    hostChecks: [],
    priorEvidence: [
      {
        path: history,
        sourceId: 'previous-run',
        revision: 'caller-selected-revision',
        reason: 'Investigate uncertainty',
      },
    ],
  };
  writeFileSync(path, JSON.stringify(value));
  return { history, path, value };
}

function invoke(f: any, a: any, command: any = 'run'): any {
  return spawnSync(
    process.execPath,
    [
      command === 'run' ? stewardEntry : cli,
      command,
      'sample',
      '--assignment',
      a.path,
      '--project',
      f.repo,
      ...(command === 'run' ? ['--codex-path', f.executable] : ['--json']),
    ],
    { encoding: 'utf8', env: f.env, timeout: 30 * 60 * 1000 },
  );
}

test('built CLI snapshots selected historical text before setup and supplies identical inspected context', (t: any) =>
  suite.builtCLISnapshotsSelectedHistoricalTextBeforeSetupAndSuppliesIdenticalInspectedContext(t));

for (const mode of ['missing', 'oversized', 'non-text', 'duplicate', 'version-one'])
  test(`historical evidence rejects ${mode} before inference`, (t: any) =>
    suite.rejectsInvalidHistoricalInput(t, mode));

test('built inspect exposes focused report regression alongside full repository verification', () =>
  suite.builtInspectExposesFocusedReportRegressionAlongsideFullRepositoryVerification());

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
