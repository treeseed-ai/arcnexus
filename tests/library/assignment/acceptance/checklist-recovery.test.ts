import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { resolveAssignment } from '../../../../dist/library/architecture/assignment.js';
import { StewardSession } from '../../../../dist/library/assignment/steward.js';
import { createWorkspace } from '../../../../dist/library/workspace/workspace.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Reproduces real specification edits followed by an invalid completed-turn checklist update. */
class ChecklistRecoveryScenarios {
  /** Preserves the accepted plan and partial specification until a valid correction reaches verification. */
  async correct(t: TestContext): Promise<void> {
    const { f, record, step } = this.fixture(t, 'checklist-recovery');
    await step();
    const plan = structuredClone(record.plan);
    await step();
    assert.equal(record.safeCheckpoint, true);
    assert.equal(record.nextStage, 'specification');
    assert.deepEqual(
      record.plan,
      plan,
      'Rejected update batches must not change the accepted plan',
    );
    assert.match(String(record.planFeedback), /Checklist completion requires evidence/);
    assert.equal(readFileSync(join(record.workspace, 'source.txt'), 'utf8'), 'before');
    assert.notEqual(readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'), 'Before');
    const thread = record.threadId;
    for (let stage = 0; stage < 3; stage++) await step();
    assert.equal(record.status, 'completed');
    assert.equal(record.threadId, thread);
    assert.ok(
      record.commands.some((command) => command.stage === 'red-test' && command.exitCode !== 0),
    );
    assert.equal(readFileSync(join(record.workspace, 'source.txt'), 'utf8'), 'after');
    assert.match(readFileSync(f.calls, 'utf8'), /General owner requests remain available/);
  }

  /** Identical invalid completion claims eventually require diagnosis instead of fabricating success. */
  async loop(t: TestContext): Promise<void> {
    const { record, step } = this.fixture(t, 'checklist-loop');
    await step();
    for (let failure = 0; failure < 3; failure++) await step();
    await assert.rejects(step, /different action|attention/);
    assert.equal(record.status, 'needs_attention');
    assert.equal(record.safeCheckpoint, false);
    assert.equal((record.plan as any).items[0].status, 'pending');
    assert.equal((record.progress as any).warnings.length, 1);
  }

  /** Partial edits without a completed model response remain unsafe and cannot enter semantic correction. */
  async uncertain(t: TestContext): Promise<void> {
    const { record, step } = this.fixture(t, 'checklist-transport');
    await step();
    await assert.rejects(step, /Disconnected before final checklist response/);
    assert.equal(record.safeCheckpoint, false);
    assert.equal(record.planFeedback, undefined);
    assert.notEqual(readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'), 'Before');
  }

  /** A captured role without release authority can still finish verified engineering and handoff. */
  async restrictedRole(t: TestContext): Promise<void> {
    const { record, step } = this.fixture(t, 'restricted-role');
    for (let stage = 0; stage < 4; stage++) await step();
    assert.equal(record.status, 'completed');
    assert.equal(record.outcome, 'ready_for_integration');
    assert.ok(record.commands.some((command) => command.stage === 'red-test'));
  }

  /** A worker that ignores its output schema cannot obtain forbidden authority through recovery. */
  async forbiddenActivity(t: TestContext): Promise<void> {
    const { record, step } = this.fixture(t, 'restricted-violation');
    for (let stage = 0; stage < 3; stage++) await step();
    await assert.rejects(step, /Role cannot perform release/);
    assert.equal(record.safeCheckpoint, false);
    assert.equal(record.status, 'failed');
  }

  /** A completed blocked response preserves the stage and edits without accepting false completion. */
  async blocked(t: TestContext): Promise<void> {
    const { record, step } = this.fixture(t, 'safe-blocked');
    await step();
    const plan = structuredClone(record.plan);
    await step();
    assert.equal(record.status, 'blocked');
    assert.equal(record.safeCheckpoint, true);
    assert.equal(record.nextStage, 'specification');
    assert.deepEqual(record.plan, plan);
    assert.match(String(record.error), /Required contract decision/);
    assert.notEqual(readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'), 'Before');
  }

  /** Captures an unlimited engineering profile and uses the production resumable session after every turn. */
  private fixture(t: TestContext, mode: string) {
    const f = workflowFixture(t, mode);
    this.configure(f, mode);
    for (const name of ['runs', 'workspaces']) mkdirSync(join(f.state, name), { recursive: true });
    const record = createWorkspace(f.state, { project: f.repo });
    record.resolvedAssignment = resolveAssignment(f.repo, record.base, 'sample', {
      objective: 'Improve behavior',
    });
    record.directionAccepted = true;
    const step = () =>
      new StewardSession(
        f.state,
        record,
        'sample',
        'Improve behavior',
        'gpt-6-luna',
        f.executable,
        new AbortController().signal,
      ).step();
    return { f, record, step };
  }

  /** Captures an unlimited profile with the deterministic planning-aware harness. */
  private configure(f: ReturnType<typeof workflowFixture>, mode: string): void {
    const module = new URL('../../testing/support/controlled-workflow.js', import.meta.url).href;
    const options = { mode, calls: f.calls, planning: true };
    writeFileSync(
      f.executable,
      `#!/usr/bin/env node\nimport(${JSON.stringify(module)}).then(({ControlledWorkflow}) => new ControlledWorkflow(${JSON.stringify(options)}).run());\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(f.repo, 'architecture/execution-profiles/luna.yaml'),
      JSON.stringify({
        schemaVersion: 3,
        id: 'luna',
        model: 'gpt-6-luna',
        reasoning: 'medium',
        webSearch: 'disabled',
        operationCategories: [],
      }),
    );
    if (mode.startsWith('restricted-')) {
      const path = join(f.repo, 'architecture/roles/engineer.yaml');
      const role = JSON.parse(readFileSync(path, 'utf8'));
      role.activities = role.activities.filter((activity: string) => activity !== 'release');
      writeFileSync(path, JSON.stringify(role));
    }
    f.commit();
  }
}

const scenarios = new ChecklistRecoveryScenarios();

test('completed-turn checklist correction preserves real specification and regression work', (t) =>
  scenarios.correct(t));

test('equivalent completed-turn checklist errors require diagnosis without retry quotas', (t) =>
  scenarios.loop(t));

test('unfinished model transport cannot become a safe checklist correction', (t) =>
  scenarios.uncertain(t));

test('captured role restricts output activities while allowing verified caller handoff', (t) =>
  scenarios.restrictedRole(t));

test('completed blocked response retains a safe unfinished specification checkpoint', (t) =>
  scenarios.blocked(t));

test('forbidden activity claims remain unsafe despite completed transport', (t) =>
  scenarios.forbiddenActivity(t));

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
