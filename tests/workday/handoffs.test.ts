import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { handoffFixture } from '../development-tooling/handoff-fixture.js';
class HandoffsTests {
  scenario_1(t: TestContext, stage: any) {
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
  rejectedOwnerRequestEndsWorkdayWithRetainedRequesterChanges_2(t: TestContext) {
    const f = handoffFixture(t, 'reject'),
      r = f.workday();
    assert.equal(r.status, 1, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, 'blocked');
    assert.equal(w.parking.status, 'restored');
  }
  scenario_3(t: TestContext, mode: any) {
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
  recipientCorrectiveAttemptIsRealAndDoesNotResetRequesterCounters_4(t: TestContext) {
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
  combinedAcceptanceRejectsARegressionAfterVerifiedDelivery_5(t: TestContext) {
    const f = handoffFixture(t, 'combined-failure'),
      r = f.workday();
    assert.equal(r.status, 1, r.stderr);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, 'failed');
    assert.ok(w.messages.some((m: any) => m.payload.decision === 'delivered'));
    assert.match(w.error, /acceptance|Command failed/i);
  }
  SDKOutputSchemaExposesOnlyCurrentlyEligibleCoordinationActions_6(t: TestContext) {
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
  test('built workday delivers and resumes ' + stage, (t: any) => suite.scenario_1(t, stage));
test('rejected owner request ends workday with retained requester changes', (t: any) =>
  suite.rejectedOwnerRequestEndsWorkdayWithRetainedRequesterChanges_2(t));
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
    suite.scenario_3(t, mode),
  );
test('recipient corrective attempt is real and does not reset requester counters', (t: any) =>
  suite.recipientCorrectiveAttemptIsRealAndDoesNotResetRequesterCounters_4(t));

test('combined acceptance rejects a regression after verified delivery', (t: any) =>
  suite.combinedAcceptanceRejectsARegressionAfterVerifiedDelivery_5(t));

test('SDK output schema exposes only currently eligible coordination actions', (t: any) =>
  suite.SDKOutputSchemaExposesOnlyCurrentlyEligibleCoordinationActions_6(t));
