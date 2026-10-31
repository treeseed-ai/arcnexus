import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class WorkdayStoreTests {
  async SQLiteDeliveryAndReadinessCommitAtomicallyBuiltViewersRetainOrderedEvidence_1(
    t: TestContext,
  ) {
    const f = workflowFixture(t),
      { WorkdayStore } = await import('../../dist/coordination-store/workday-store.js');
    const directory = join(f.state, 'workdays', 'one');
    mkdirSync(directory, { recursive: true });
    const store = new WorkdayStore(join(directory, 'workday.sqlite'), true);
    try {
      store.initialize('one', { base: f.git('rev-parse', 'HEAD') }, ['sample', 'dependency']);
      store.commit(
        'request.delivered',
        { id: 'request-1' },
        {
          assignments: [{ id: 'dependency', status: 'ready', data: {} }],
          messages: [
            {
              id: 'request-1',
              from: 'sample',
              to: 'dependency',
              kind: 'request',
              payload: { contract: 'sample' },
            },
          ],
        },
      );
      assert.throws(() =>
        store.commit(
          'duplicate',
          {},
          {
            assignments: [{ id: 'dependency', status: 'incorrect', data: {} }],
            messages: [
              { id: 'request-1', from: 'sample', to: 'dependency', kind: 'request', payload: {} },
            ],
          },
        ),
      );
      assert.equal(
        store.snapshot().assignments.find((a: any) => a.id === 'dependency')?.status,
        'ready',
      );
      assert.equal(store.events().length, 2);
      store.commit(
        'workday.finished',
        {},
        { workday: { id: 'one', status: 'completed', data: {} } },
      );
    } finally {
      store.close();
    }
    const workday = (...args: any) =>
      spawnSync(process.execPath, [cli, 'workday', ...args], {
        encoding: 'utf8',
        env: f.env,
        timeout: 10000,
      });
    const status = workday('status', 'one', '--json');
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).messages.length, 1);
    const follow = workday('follow', 'one', '--after', '1', '--json');
    assert.equal(follow.status, 0, follow.stderr);
    assert.deepEqual(
      follow.stdout
        .trim()
        .split('\n')
        .map((x: any) => JSON.parse(x).sequence),
      [2, 3],
    );
    assert.equal(workday('status', 'missing', '--json').status, 2);
  }
}
const suite = new WorkdayStoreTests();

test('SQLite delivery and readiness commit atomically; built viewers retain ordered evidence', (t: any) =>
  suite.SQLiteDeliveryAndReadinessCommitAtomicallyBuiltViewersRetainOrderedEvidence_1(t));
