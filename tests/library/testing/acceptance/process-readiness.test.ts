import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { TestProcess } from '../support/test-process.js';

/** Distinguishes failed startup from a process that is still approaching an interruption boundary. */
class ProcessReadinessScenarios {
  /** A child that exits before its marker fails immediately with its actual diagnostic. */
  async exited(t: TestContext): Promise<void> {
    const child = new TestProcess(
      t,
      ['-e', "console.error('PREPARATION_FAILED');process.exit(9)"],
      process.env,
    );
    await assert.rejects(
      child.waitForReady(() => false, 'Expected implementation marker'),
      /Expected implementation marker.*PREPARATION_FAILED/s,
    );
    assert.equal(await child.closed, 9);
  }

  /** A real readiness marker permits the caller to test cancellation at the intended stage. */
  async ready(t: TestContext): Promise<void> {
    const child = new TestProcess(
      t,
      ['-e', "console.log('READY');setInterval(()=>{},1000)"],
      process.env,
    );
    await child.waitForReady(() => child.stdout.includes('READY'), 'Expected readiness');
    child.kill('SIGINT');
    assert.equal(await child.closed, null);
  }
}

const scenarios = new ProcessReadinessScenarios();

test('test readiness retains failed startup diagnostics', (t) => scenarios.exited(t));

test('test readiness observes its marker before exercising cancellation', (t) =>
  scenarios.ready(t));

registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
