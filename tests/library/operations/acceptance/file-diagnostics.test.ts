import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { execute } from '../../../../dist/library/operations/process.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Verifies regular diagnostic descriptors retain transport limits and supervised cancellation. */
class FileDiagnosticScenarios {
  /** Retains both streams through host-opened descriptors with no child log-path access required. */
  async streams(t: TestContext): Promise<void> {
    const { root, log } = this.fixture(t);
    await execute(
      { command: process.execPath, args: ['-e', "console.log('out');console.error('err')"] },
      root,
      log,
      new AbortController().signal,
      { fileOutput: true },
    );
    assert.match(readFileSync(log, 'utf8'), /out/);
    assert.match(readFileSync(log, 'utf8'), /err/);
  }

  /** A finite fast writer cannot escape the diagnostic cap by exiting before the watchdog ticks. */
  async bounded(t: TestContext): Promise<void> {
    const { root, log } = this.fixture(t);
    const command = {
      command: process.execPath,
      args: [
        '-e',
        "const f=require('fs');const b=Buffer.alloc(1024*1024);for(let i=0;i<65;i++)f.writeSync(1,b);",
      ],
    };
    await assert.rejects(
      execute(command, root, log, new AbortController().signal, { fileOutput: true }),
      /output limit/,
    );
    assert.equal(statSync(log).size, 64 * 1024 * 1024);
  }

  /** Cancellation remains an explicit stop even when the child does not use socket-backed output. */
  async cancelled(t: TestContext): Promise<void> {
    const { root, log } = this.fixture(t);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('cancel diagnostic command')), 500);
    try {
      await assert.rejects(
        execute(
          {
            command: process.execPath,
            args: ['-e', "console.log('waiting');setInterval(()=>{},1000)"],
          },
          root,
          log,
          controller.signal,
          { fileOutput: true },
        ),
        /cancel diagnostic command/,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Owns one disposable log directory per scenario. */
  private fixture(t: TestContext) {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-file-diagnostics-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return { root, log: join(root, 'command.log') };
  }
}

const scenarios = new FileDiagnosticScenarios();

test('regular diagnostic descriptors retain stdout and stderr', (t) => scenarios.streams(t));

test('regular diagnostic descriptors retain the transport output cap', (t) => scenarios.bounded(t));

test('regular diagnostic descriptors preserve explicit cancellation', (t) =>
  scenarios.cancelled(t));

registerSuite({ component: 'operations', level: 'acceptance', tags: ['deterministic'] });
