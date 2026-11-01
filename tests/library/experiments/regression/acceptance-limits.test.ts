import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';

/** Exercises acceptance limit behavior through observable scenarios. */
class AcceptanceLimitTests {
  /** Verifies that workday acceptance still rejects exceeding an explicitly captured limit. */
  report(t: TestContext, timeoutSeconds?: number): void {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-acceptance-limits-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, 'report.json');
    writeFileSync(path, JSON.stringify(this.record(timeoutSeconds)));
    const result = spawnSync(
      process.execPath,
      [resolve('dist/library/experiments/checks/workday-report.js'), path],
      {
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      },
    );
    assert.equal(result.status, timeoutSeconds === undefined ? 0 : 1, result.stderr);
    if (timeoutSeconds !== undefined) assert.match(result.stderr, /Explicit active-time limit/);
  }

  /** Creates the evidence record before subsequent lifecycle work begins. */
  private record(timeoutSeconds?: number) {
    return {
      status: 'completed',
      parking: { status: 'restored' },
      messages: [
        { kind: 'request', payload: {} },
        { payload: { decision: 'accepted' } },
        { payload: { decision: 'delivered' } },
      ],
      events: [{ type: 'assignment.resumed' }],
      assignments: ['requester', 'recipient'].map((threadId) => ({
        status: 'completed',
        threadId,
        activeMs: 900001,
        callerInterventions: [],
        turns: [{ threadId }],
        executionLimits: { timeoutSeconds },
      })),
    };
  }
}

const suite = new AcceptanceLimitTests();

test('workday acceptance permits elapsed time beyond former defaults when no limit is captured', (t) =>
  suite.report(t));

test('workday acceptance still rejects exceeding an explicitly captured limit', (t) =>
  suite.report(t, 900));

registerSuite({
  component: 'experiments',
  level: 'acceptance',
  tags: ['deterministic', 'regression'],
});
