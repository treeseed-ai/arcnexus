import { appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export class ControlledInitializer {
  respond(prompt: string, args: string[], calls: string, mode = 'ready'): boolean {
    if (!prompt.startsWith('ArcNexus initialization:')) return false;
    const owners = JSON.parse(
      prompt.split('Captured execution owners: ')[1]!.split('\n')[0]!,
    ) as string[];
    appendFileSync(calls + '.initialization', JSON.stringify({ owners, args }) + '\n');
    if (mode === 'write') writeFileSync('source.txt', 'initializer mutation');
    this.result(this.response(owners, mode));
    return true;
  }
  private response(owners: string[], mode: string): unknown {
    return {
      status: mode === 'question' ? 'needs_clarification' : 'ready',
      summary: 'Captured owners confirmed',
      selectedOwners: owners.map((id) => ({
        id: mode === 'widen' ? 'unauthorized-owner' : id,
        reason: 'Captured responsibility',
      })),
      rejectedOwners: [],
      questions: mode === 'question' ? ['Which contract should change?'] : [],
      assignments: [],
      dependency: null,
      architectureProposal: null,
    };
  }
  private result(result: unknown): void {
    this.emit({
      type: 'thread.started',
      thread_id:
        'initializer-' + createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12),
    });
    this.emit({
      type: 'item.completed',
      item: { id: 'initializer-result', type: 'agent_message', text: JSON.stringify(result) },
    });
    this.emit({
      type: 'turn.completed',
      usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
    });
  }
  private emit(value: unknown): void {
    console.log(JSON.stringify(value));
  }
}
