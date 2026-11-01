import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { HostClient } from '../../library/execution-runtime/host-client.js';
import type { ExecutionRun } from '../../library/coordination-store/execution-types.js';

/** Adapts the minimal user commands to persistent project execution. */
export class ExecutionCommand {
  private readonly client = new HostClient(process.cwd());

  /** Retains caller cancellation without coupling background workday lifetime to the terminal. */
  constructor(private readonly signal: AbortSignal) {}

  /** Applies one option-free workday control and prints its authoritative state. */
  async workday(action: string): Promise<void> {
    await this.client.ensure();
    console.log(JSON.stringify(await this.client.request({ action }), null, 2));
  }

  /** Submits a prompt and streams changed state until completion, cancellation or missing input. */
  async task(prompt: string): Promise<void> {
    await this.client.ensure();
    const run = (await this.client.request({ action: 'submit', prompt })) as ExecutionRun;
    let previous = '';
    while (!this.signal.aborted) {
      const result = await this.client.request({ action: 'task-status', id: run.id });
      const output = JSON.stringify(result);
      if (output !== previous) {
        console.log(output);
        previous = output;
      }
      if (result.run.status === 'needs_input' && (await this.answer(result.run))) continue;
      if (!['running', 'pausing'].includes(result.run.status)) {
        process.exitCode =
          result.run.status === 'completed' ? 0 : result.run.status === 'cancelled' ? 130 : 1;
        return;
      }
      await delay(200);
    }
    await this.client.request({ action: 'cancel', id: run.id });
    process.exitCode = 130;
  }

  /** Asks only genuine director questions; noninteractive callers retain needs-input evidence. */
  private async answer(run: ExecutionRun): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await terminal.question(
        JSON.stringify(run.data.questions ?? run.data.architectureProposal) + '\nYour response: ',
        { signal: this.signal },
      );
      await this.client.request({ action: 'answer', id: run.id, answer });
      return true;
    } catch {
      return false;
    } finally {
      terminal.close();
    }
  }
}
