import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { WorkdayStore } from '../../../../dist/library/coordination-store/workday-store.js';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises workday store behavior through observable scenarios. */
class WorkdayStoreTests {
  /** Verifies that delivery and readiness are atomic. */
  deliveryAndReadinessAreAtomic(t: TestContext): void {
    const fixture = workflowFixture(t);
    const directory = join(fixture.state, 'workdays', 'one');
    mkdirSync(directory, { recursive: true });
    const store = new WorkdayStore(join(directory, 'workday.sqlite'), true);
    try {
      store.initialize('one', { base: fixture.git('rev-parse', 'HEAD') }, ['sample', 'dependency']);
      this.deliver(store);
      this.assertDuplicateRollsBack(store);
      store.commit(
        'workday.finished',
        {},
        { workday: { id: 'one', status: 'completed', data: {} } },
      );
    } finally {
      store.close();
    }
    this.assertBuiltViewers(fixture.env);
  }

  /** Commits message delivery and dependent readiness through one durable store transition. */
  private deliver(store: WorkdayStore): void {
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
  }

  /** Requires duplicate delivery to roll back without additional scheduling or events. */
  private assertDuplicateRollsBack(store: WorkdayStore): void {
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
      store.snapshot().assignments.find((assignment) => assignment.id === 'dependency')?.status,
      'ready',
    );
    assert.equal(store.events().length, 2);
  }

  /** Runs the built workday viewers against the persisted coordination state. */
  private assertBuiltViewers(env: NodeJS.ProcessEnv): void {
    const workday = (...args: string[]) =>
      spawnSync(process.execPath, [cli, 'workday', ...args], {
        encoding: 'utf8',
        env,
        timeout: 30 * 60 * 1000,
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
        .map((line) => JSON.parse(line).sequence),
      [2, 3],
    );
    assert.equal(workday('status', 'missing', '--json').status, 2);
  }
}

const suite = new WorkdayStoreTests();

test('SQLite delivery and readiness commit atomically; built viewers retain ordered evidence', (t) =>
  suite.deliveryAndReadinessAreAtomic(t));

registerSuite({ component: 'coordination-store', level: 'integration', tags: ['deterministic'] });
