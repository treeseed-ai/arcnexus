import { randomUUID } from 'node:crypto';
import type { BridgeTool } from './bridge.js';
interface PendingCall {
  settled: Promise<void>;
  result?: unknown;
  error?: unknown;
  complete: boolean;
}
/** Transport replies are bounded; underlying authorized work has no implicit deadline. */
export class PendingCalls {
  private readonly calls = new Map<string, PendingCall>();
  readonly tool: BridgeTool = {
    name: 'execution.wait',
    description:
      'Wait for a pending operation response by its host-returned requestId. Waits until completion; receive the result before ending the turn. This observes the same operation and does not restart it or consume an operation allowance.',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string' } },
      required: ['requestId'],
      additionalProperties: false,
    },
  };
  constructor(private readonly execute: (name: string, args: unknown) => Promise<unknown>) {}
  async call(name: string, args: unknown): Promise<unknown> {
    if (name === this.tool.name) return this.complete(this.identity(args));
    const id = randomUUID();
    const pending: PendingCall = { settled: Promise.resolve(), complete: false };
    pending.settled = this.execute(name, args)
      .then(
        (result) => {
          pending.result = result;
        },
        (error) => {
          pending.error = error;
        },
      )
      .finally(() => {
        pending.complete = true;
      });
    this.calls.set(id, pending);
    return this.wait(id);
  }
  async drain(): Promise<void> {
    await Promise.all([...this.calls.values()].map((call) => call.settled));
    this.calls.clear();
  }
  private identity(args: unknown): string {
    if (
      !args ||
      typeof args !== 'object' ||
      Object.keys(args).length !== 1 ||
      !('requestId' in args) ||
      typeof args.requestId !== 'string' ||
      !this.calls.has(args.requestId)
    )
      throw new Error('Unknown pending operation reference');
    return args.requestId;
  }
  private async complete(id: string): Promise<unknown> {
    const pending = this.calls.get(id)!;
    await pending.settled;
    this.calls.delete(id);
    if (pending.error) throw pending.error;
    return pending.result;
  }
  private async wait(id: string): Promise<unknown> {
    const pending = this.calls.get(id)!;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        pending.settled,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1000);
        }),
      ]);
      if (!pending.complete)
        return {
          status: 'pending',
          requestId: id,
          next: 'execution.wait',
          executionDeadline: 'unchanged; transport observation only',
        };
      this.calls.delete(id);
      if (pending.error) throw pending.error;
      return pending.result;
    } finally {
      clearTimeout(timer);
    }
  }
}
