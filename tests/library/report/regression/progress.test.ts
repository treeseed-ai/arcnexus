import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { observe } from '../../../../dist/library/report/timeline.js';
import { operationFixture } from '../../testing/support/operations-fixture.js';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises progress projection behavior through observable scenarios. */
class ProgressProjectionTests {
  /** Handles initializer command within this component’s captured contract. */
  initializerCommand(t: TestContext): void {
    const f = workflowFixture(t);
    const record = this.preparingRecord(f);
    observe(f.state, record, 'initialization.event', {
      type: 'codex.event',
      payload: {
        type: 'item.started',
        item: {
          type: 'command_execution',
          command: 'initializer-tool --version',
        },
      },
    });
    const result = spawnSync(process.execPath, [cli, 'status', record.id, '--json'], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).progress.currentCommand, 'initializer-tool --version');
  }

  /** Handles finished operation within this component’s captured contract. */
  finishedOperation(t: TestContext): void {
    const f = workflowFixture(t);
    const record = this.preparingRecord(f);
    observe(f.state, record, 'operation.started', { id: 'report-tests' });
    observe(f.state, record, 'operation.finished', { id: 'report-tests', result: { exitCode: 0 } });
    const result = spawnSync(process.execPath, [cli, 'status', record.id, '--json'], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).progress.currentCommand, null);
  }

  /** Handles preparing record within this component’s captured contract. */
  private preparingRecord(f: ReturnType<typeof workflowFixture>): any {
    const prepared = spawnSync(process.execPath, [cli, 'prepare', '--project', f.repo], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(prepared.status, 0, prepared.stderr);
    const record = JSON.parse(prepared.stdout);
    record.status = 'initializing';
    record.stage = 'initialization';
    delete record.finishedAt;
    writeFileSync(join(f.state, 'runs', record.id, 'report.json'), JSON.stringify(record));
    return record;
  }

  /** Handles reports verified progress within this component’s captured contract. */
  reportsVerifiedProgress(t: TestContext): void {
    const f = operationFixture(t);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    const status = spawnSync(process.execPath, [cli, 'status', record.id, '--json'], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
    assert.equal(status.status, 0, status.stderr);
    const view = JSON.parse(status.stdout);
    assert.ok(view.progress.lastVerified);
    assert.equal(view.progress.checklist.total, 1);
    assert.equal(view.progress.checklist.completed, 1);
    assert.equal(view.progress.checklist.basis, 'agent claims; host checks reported separately');
    assert.equal(view.progress.cancellation, 'not requested');
    const markdown = readFileSync(join(f.state, 'runs', record.id, 'report.md'), 'utf8');
    assert.match(markdown, /## Initialization/);
    assert.match(markdown, /## Execution progress/);
    assert.match(markdown, /Last verified progress/);
  }
}

const suite = new ProgressProjectionTests();

test('status and readable report separate checklist claims from verified progress', (t) =>
  suite.reportsVerifiedProgress(t));

test('parent status exposes the currently observed initializer command', (t) =>
  suite.initializerCommand(t));

test('status clears a finished operation before the next activity transition', (t) =>
  suite.finishedOperation(t));

registerSuite({ component: 'report', level: 'acceptance', tags: ['deterministic', 'regression'] });
