import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
/** Watchdogs here bound the test harness, never application execution defaults. */
export async function waitFor(
  condition: () => boolean,
  message: string,
  timeoutMs = 30 * 60 * 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      if (condition()) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    assert.ok(Date.now() < deadline, message);
    await delay(25);
  }
}
export class TestProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly closed: Promise<number | null>;
  stdout = '';
  stderr = '';
  constructor(t: TestContext, args: string[], env: NodeJS.ProcessEnv) {
    this.child = spawn(process.execPath, args, { env });
    this.child.stdout.on('data', (chunk) => {
      this.stdout += chunk;
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.closed = new Promise((resolve, reject) => {
      this.child.once('close', resolve);
      this.child.once('error', reject);
    });
    t.after(() => {
      this.child.kill('SIGKILL');
    });
  }
  kill(signal: NodeJS.Signals): void {
    this.child.kill(signal);
  }
}
export function killProcessGroup(pid?: number): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* Already stopped. */
  }
}
