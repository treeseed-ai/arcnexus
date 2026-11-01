import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { handoffFixture } from '../../testing/support/handoff-fixture.js';

/** Exercises handoffs behavior through observable scenarios. */
class HandoffsTests {
  /** Verifies the scenario delivers and resumes activity. */
  deliversAndResumesActivity(t: TestContext, stage: any) {
    const f = handoffFixture(t, stage),
      r = f.workday();
    assert.equal(r.status, 0, r.stderr + '\n' + r.stdout);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, 'completed');
    assert.equal(w.initialization.turns, 1);
    assert.equal(
      readFileSync(f.calls + '.initialization', 'utf8')
        .trim()
        .split('\n').length,
      1,
    );
    assert.equal(w.assignments.length, 2);
    assert.ok(w.messages.some((m: any) => m.payload.decision === 'delivered'));
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    assert.ok(calls.some((c: any) => c.owner === 'dependency'));
    assert.ok(
      calls.filter((c: any) => c.owner === 'sample').some((c: any) => c.args.includes('resume')),
    );
    assert.equal(f.git('status', '--porcelain'), '');
    assert.equal(w.parking.status, 'restored');
    assert.ok(w.metrics.usageComplete);
    const markdown = readFileSync(join(f.state, 'workdays', w.workspaceId, 'report.md'), 'utf8');
    assert.match(markdown, /## Host checks/);
    assert.match(markdown, /## Outstanding needs/);
  }

  /** Verifies that rejected owner request ends workday with retained requester changes. */
  rejectedOwnerRequestEndsWorkdayWithRetainedRequesterChanges(t: TestContext) {
    const f = handoffFixture(t, 'reject'),
      r = f.workday();
    assert.equal(r.status, 1, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, 'blocked');
    assert.equal(w.parking.status, 'restored');
  }

  /** Verifies the scenario rejects invalid handoff. */
  rejectsInvalidHandoff(t: TestContext, mode: any) {
    const f = handoffFixture(t, mode),
      r = f.workday();
    assert.equal(r.status, 1, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.notEqual(w.status, 'completed');
    assert.match(
      w.error,
      /owner|Nested|budget|requesting|Other-owner|Command failed|blocked|Coordination|NeedsAttention/i,
    );
    if (mode === 'exhaust-clarification') assert.equal(w.status, 'needs_attention');
    if (mode === 'unknown-owner')
      assert.match(
        readFileSync(join(f.state, 'workdays', w.workspaceId, 'report.md'), 'utf8'),
        /ownerId.*unknown/,
      );
    if (mode === 'no-delivery')
      assert.equal(
        w.messages.some((m: any) => m.payload.decision === 'delivered'),
        false,
      );
  }

  /** Verifies that recipient corrective attempt is real and does not reset requester counters. */
  recipientCorrectiveAttemptIsRealAndDoesNotResetRequesterCounters(t: TestContext) {
    const f = handoffFixture(t, 'repair'),
      r = f.workday();
    assert.equal(r.status, 0, r.stderr);
    const w = JSON.parse(r.stdout),
      a = w.assignments.find((a: any) => a.resolvedAssignment.componentId === 'dependency');
    assert.equal(a.implementationAttempts, 2);
    assert.ok(a.turns.some((t: any) => t.activity === 'correction'));
    assert.equal(
      w.assignments.find((a: any) => a.resolvedAssignment.componentId === 'sample')
        .implementationAttempts,
      1,
    );
  }

  /** Verifies that combined acceptance rejects aregression after verified delivery. */
  combinedAcceptanceRejectsARegressionAfterVerifiedDelivery(t: TestContext) {
    const f = handoffFixture(t, 'combined-failure'),
      r = f.workday();
    assert.equal(r.status, 1, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, 'failed');
    assert.ok(w.messages.some((m: any) => m.payload.decision === 'delivered'));
    assert.match(w.error, /acceptance|Command failed/i);
  }

  /** Verifies that sdkoutput schema exposes only currently eligible coordination actions. */
  SDKOutputSchemaExposesOnlyCurrentlyEligibleCoordinationActions(t: TestContext) {
    const f = handoffFixture(t),
      r = f.workday();
    assert.equal(r.status, 0, r.stderr);
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    this.contracts(calls);
    assert.deepEqual(
      calls.find((c: any) => c.owner === 'sample' && c.stage === 'planning').coordinationSchema
        .anyOf[1].properties.action.enum,
      ['request'],
    );
    assert.deepEqual(
      calls.find((c: any) => c.owner === 'dependency' && c.stage === 'planning').coordinationSchema
        .anyOf[1].properties.action.enum,
      ['accept', 'reject', 'clarify'],
    );
    assert.deepEqual(
      calls.find((c: any) => c.owner === 'dependency' && c.stage === 'specification')
        .coordinationSchema,
      { type: 'null' },
    );
    assert.deepEqual(
      calls.filter((c: any) => c.owner === 'sample' && c.stage === 'implementation').at(-1)
        .coordinationSchema,
      { type: 'null' },
    );
  }

  /** Checks that every coordination response schema retains the captured contract identifier. */
  private contracts(calls: any[]): void {
    for (const call of calls) {
      const schema = call.coordinationSchema.anyOf?.[1];
      if (schema) assert.deepEqual(schema.properties.contract.enum, ['sample-contract']);
    }
  }
}

const suite = new HandoffsTests();

for (const stage of [
  'planning',
  'planning-updates',
  'specification',
  'implementation',
  'review',
  'clarify',
  'completed-specification',
  'refresh',
])
  test('built workday delivers and resumes ' + stage, (t: any) =>
    suite.deliversAndResumesActivity(t, stage),
  );

test('rejected owner request ends workday with retained requester changes', (t: any) =>
  suite.rejectedOwnerRequestEndsWorkdayWithRetainedRequesterChanges(t));

for (const mode of [
  'unknown-owner',
  'foreign-contract',
  'unsolicited-answer',
  'duplicate',
  'exhaust-clarification',
  'forged',
  'foreign-edit',
  'weak-test',
  'no-delivery',
])
  test('workday retains failure without unauthorized delivery: ' + mode, (t: any) =>
    suite.rejectsInvalidHandoff(t, mode),
  );

test('recipient corrective attempt is real and does not reset requester counters', (t: any) =>
  suite.recipientCorrectiveAttemptIsRealAndDoesNotResetRequesterCounters(t));

test('combined acceptance rejects a regression after verified delivery', (t: any) =>
  suite.combinedAcceptanceRejectsARegressionAfterVerifiedDelivery(t));

test('SDK output schema exposes only currently eligible coordination actions', (t: any) =>
  suite.SDKOutputSchemaExposesOnlyCurrentlyEligibleCoordinationActions(t));

registerSuite({ component: 'workday', level: 'acceptance', tags: ['deterministic'] });
