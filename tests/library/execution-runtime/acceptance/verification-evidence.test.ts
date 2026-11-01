import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { Direction } from '../../../../dist/library/task-intake/direction.js';
import { createWorkspace, prepareWorkspace } from '../../../../dist/library/workspace/workspace.js';
import { CandidateSnapshots } from '../../../../dist/library/workspace/candidates.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Verifies the independent model receives immutable host change evidence through a constrained tool. */
class VerificationEvidenceScenarios {
  /** Both owner and whole-goal assessments can inspect accumulated tracked and untracked changes. */
  async inspect(t: TestContext, goal: boolean): Promise<void> {
    const { f, context, record } = await this.fixture(t, goal);
    await new Direction(f.state, context, new AbortController().signal).verify(
      record,
      'a',
      'READ_HOST_EVIDENCE: confirm exact candidate changes',
      goal ? [] : { criteria: ['Scope is observed'] },
      goal,
    );
    const trace = JSON.parse(readFileSync(f.calls + '.evidence', 'utf8').trim());
    assert.equal(trace.manifest.baseline, context.base);
    assert.deepEqual(
      trace.manifest.changes.map((change: any) => change.path),
      ['docs/evidence.md', 'source.txt'],
    );
    assert.match(trace.artifacts.patch, /observed candidate change/);
    const addition = trace.manifest.artifacts.find(
      (artifact: any) => artifact.path === 'docs/evidence.md',
    );
    if (!goal) assert.equal(trace.artifacts[addition.id], 'New captured evidence\n');
    assert.equal(
      readFileSync(join(record.workspace, 'source.txt'), 'utf8'),
      'observed candidate change\n',
    );
  }

  /** Artifact names are fixed host capabilities and cannot be used to read arbitrary evidence-directory paths. */
  async forbidden(t: TestContext): Promise<void> {
    const { f, context, record } = await this.fixture(t, false);
    await assert.rejects(
      () =>
        new Direction(f.state, context, new AbortController().signal).verify(
          record,
          'a',
          'READ_HOST_EVIDENCE FORBIDDEN_ARTIFACT',
          { criteria: ['Scope is observed'] },
        ),
      /Unknown verification artifact/,
    );
  }

  /** Creates real isolated candidate changes, optionally materializing them as a clean accumulated snapshot. */
  private async fixture(t: TestContext, goal: boolean) {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    for (const name of ['runs', 'workspaces']) mkdirSync(join(f.state, name), { recursive: true });
    let record = createWorkspace(f.state, { project: f.repo, bindings: context.bindings });
    await prepareWorkspace(f.state, record, new AbortController().signal);
    writeFileSync(join(record.workspace, 'source.txt'), 'observed candidate change\n');
    writeFileSync(join(record.workspace, 'docs/evidence.md'), 'New captured evidence\n');
    if (goal) {
      const snapshots = new CandidateSnapshots(f.repo, join(f.state, 'snapshots'));
      const base = snapshots.capture(record.workspace, record.base);
      record = createWorkspace(f.state, {
        project: f.repo,
        base,
        authorityBase: context.base,
        bindings: context.bindings,
      });
      await prepareWorkspace(f.state, record, new AbortController().signal);
    }
    return { f, context, record };
  }
}

const scenarios = new VerificationEvidenceScenarios();

for (const goal of [false, true])
  test(
    'read-only verification receives complete host evidence for ' +
      (goal ? 'the accumulated goal' : 'an owner delivery'),
    (t) => scenarios.inspect(t, goal),
  );

test('verification artifact access rejects arbitrary host paths', (t) => scenarios.forbidden(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
