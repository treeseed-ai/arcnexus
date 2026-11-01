import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { ActiveBudget } from '../../../../dist/library/workday/workday-budget.js';
import { WorktreeParking, entry } from '../../../../dist/library/workday/workday-parking.js';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises parking behavior through observable scenarios. */
class ParkingTests {
  /** Verifies that parking preserves distinct index bytes working bytes deletions modes and new files. */
  parkingPreservesDistinctIndexBytesWorkingBytesDeletionsModesAndNewFiles(t: TestContext) {
    const f = workflowFixture(t);
    const { r, git } = this.prepareCandidate(f);
    this.editCandidate(r.workspace, git);
    const paths = ['source.txt', 'delete.txt', 'new.txt'],
      before = paths.map((p: any) => entry(r, p)),
      parking = new WorktreeParking(r, join(f.root, 'parking.json'));
    parking.park(paths);
    assert.equal(git('status', '--porcelain'), '');
    writeFileSync(join(r.workspace, 'other.txt'), 'recipient');
    parking.restore();
    assert.deepEqual(
      paths.map((p: any) => entry(r, p)),
      before,
    );
    assert.equal(readFileSync(join(r.workspace, 'other.txt'), 'utf8'), 'recipient');
    assert.equal(statSync(join(r.workspace, 'source.txt')).mode & 0o777, 0o755);
  }

  /** Handles prepare candidate within this component’s captured contract. */
  private prepareCandidate(f: any) {
    writeFileSync(join(f.repo, 'delete.txt'), 'delete');
    f.commit();
    const p = spawnSync(process.execPath, [cli, 'prepare', '--project', f.repo], {
      encoding: 'utf8',
      env: f.env,
    });
    assert.equal(p.status, 0, p.stderr);
    const r = JSON.parse(p.stdout),
      git = (...args: any) => {
        const x = spawnSync('git', ['-C', r.workspace, ...args], {
          encoding: 'utf8',
        });
        assert.equal(x.status, 0, x.stderr);
        return x.stdout;
      };
    return { r, git };
  }

  /** Handles edit candidate within this component’s captured contract. */
  private editCandidate(workspace: string, git: (...args: string[]) => string): void {
    writeFileSync(join(workspace, 'source.txt'), Buffer.from([0, 1, 255]));
    git('add', 'source.txt');
    writeFileSync(join(workspace, 'source.txt'), 'working');
    chmodSync(join(workspace, 'source.txt'), 0o755);
    unlinkSync(join(workspace, 'delete.txt'));
    writeFileSync(join(workspace, 'new.txt'), 'new');
  }

  /** Verifies that parking refuses replacement and cleanup refuses unresolved workday transition. */
  parkingRefusesReplacementAndCleanupRefusesUnresolvedWorkdayTransition(t: TestContext) {
    const f = workflowFixture(t),
      p = spawnSync(process.execPath, [cli, 'prepare', '--project', f.repo], {
        encoding: 'utf8',
        env: f.env,
      }),
      r = JSON.parse(p.stdout),
      path = join(f.root, 'parking.json');
    writeFileSync(join(r.workspace, 'source.txt'), 'partial');
    const parking = new WorktreeParking(r, path);
    parking.park(['source.txt']);
    writeFileSync(join(r.workspace, 'source.txt'), 'replacement');
    assert.throws(() => parking.restore(), /replaced/);
    r.workday = { assignments: [], parking: path };
    writeFileSync(join(f.state, 'runs', r.id, 'report.json'), JSON.stringify(r));
    const cleanup = spawnSync(process.execPath, [cli, 'cleanup', r.id], {
      encoding: 'utf8',
      env: f.env,
    });
    assert.equal(cleanup.status, 1);
    assert.match(cleanup.stderr, /unresolved/);
    assert.equal(readFileSync(join(r.workspace, 'source.txt'), 'utf8'), 'replacement');
  }

  /** Verifies that active clock excludes suspension but does not reset its consumed allowance. */
  async activeClockExcludesSuspensionButDoesNotResetItsConsumedAllowance() {
    const { setTimeout: delay } = await import('node:timers/promises'),
      b = new ActiveBudget(new AbortController().signal, 100);
    b.start();
    await delay(30);
    b.pause();
    const used = b.elapsedMs;
    await delay(120);
    assert.equal(b.elapsedMs, used);
    assert.equal(b.signal.aborted, false);
    b.start();
    await delay(120);
    assert.equal(b.signal.aborted, true);
    b.pause();
  }
}

const suite = new ParkingTests();

test('parking preserves distinct index bytes working bytes deletions modes and new files', (t: any) =>
  suite.parkingPreservesDistinctIndexBytesWorkingBytesDeletionsModesAndNewFiles(t));

test('parking refuses replacement and cleanup refuses unresolved workday transition', (t: any) =>
  suite.parkingRefusesReplacementAndCleanupRefusesUnresolvedWorkdayTransition(t));

test('active clock excludes suspension but does not reset its consumed allowance', () =>
  suite.activeClockExcludesSuspensionButDoesNotResetItsConsumedAllowance());

registerSuite({ component: 'workday', level: 'integration', tags: ['deterministic'] });
