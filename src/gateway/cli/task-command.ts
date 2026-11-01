import { ExecutionCommand } from './execution-command.js';
import { InputError } from '../../library/architecture/config.js';
import { ProposalStore } from '../../library/task-intake/tasks.js';
import { stateRoot } from '../../library/workspace/state.js';

/** Runs prompt tasks through the project host and reads historical proposals without executing them. */
export class TaskCommand {
  /** Retains task arguments and cancellation without creating execution state. */
  constructor(
    private readonly positionals: string[],
    private readonly values: Record<string, string | boolean | undefined>,
    private readonly signal: AbortSignal,
  ) {}

  /** Rejects retired execution before dispatch and preserves read-only proposal inspection. */
  async run(): Promise<void> {
    const action = this.positionals[1];
    if (action === 'plan' || action === 'legacy-run')
      throw new InputError('Proposal execution is retired; use task run "<prompt>"');
    if (this.positionals.length !== 3 || !['run', 'inspect'].includes(action ?? ''))
      throw new InputError(
        'task run requires exactly one prompt; task inspect requires one historical proposal ID',
      );
    const allowed = action === 'inspect' ? ['json'] : [];
    if (Object.keys(this.values).some((key) => !allowed.includes(key)))
      throw new InputError('Invalid task options');
    if (action === 'run') return new ExecutionCommand(this.signal).task(this.positionals[2]!);
    console.log(
      JSON.stringify(
        new ProposalStore(stateRoot()).load(this.positionals[2]!),
        null,
        this.values.json ? undefined : 2,
      ),
    );
  }
}
