import { createHash } from 'node:crypto';

/** Scripted routing evidence for fixed simulations, never live qualification. */
export class SimulationInitializer {
  /** Handles respond within this component’s captured contract. */
  respond(prompt: string): boolean {
    if (!prompt.startsWith('ArcNexus initialization:')) return false;
    const owners: string[] = JSON.parse(
      prompt.split('Captured execution owners: ')[1]!.split('\n')[0]!,
    );
    if (!owners.length) throw new Error('Fixed simulation does not infer arbitrary task routing');
    this.emit({
      type: 'thread.started',
      thread_id:
        'simulated-intake-' + createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16),
    });
    const result = this.result(owners);
    this.emit({
      type: 'item.completed',
      item: { id: 'simulated-initialization', type: 'agent_message', text: JSON.stringify(result) },
    });
    this.emit({
      type: 'turn.completed',
      usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
    });
    return true;
  }

  /** Handles result within this component’s captured contract. */
  private result(owners: string[]) {
    return {
      status: 'ready',
      summary: 'SIMULATED routing confirmation',
      selectedOwners: owners.map((id) => ({
        id,
        reason: 'Scripted captured owner; not a model assessment',
      })),
      rejectedOwners: [],
      questions: [],
      assignments: [],
      dependency: null,
      architectureProposal: null,
    };
  }

  /** Handles emit within this component’s captured contract. */
  private emit(value: unknown): void {
    console.log(JSON.stringify(value));
  }
}
