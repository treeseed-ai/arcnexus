import type { CliValues } from './arguments.js';
import { InputError } from '../../library/architecture/config.js';
import { viewExecution } from '../../library/report/timeline.js';
import { stateRoot } from '../../library/workspace/state.js';

/** Views retained execution evidence without controlling the active assignment. */
export class ObservationCommand {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private readonly positionals: string[],
    private readonly values: CliValues,
    private readonly command: string,
    private readonly signal: AbortSignal,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const { values, positionals, command } = this;
    if (positionals.length !== 2 || (values.after !== undefined && !/^[0-9]+$/.test(values.after)))
      throw new InputError('Invalid viewer arguments');
    const after = Number(values.after ?? 0);
    if (!Number.isSafeInteger(after)) throw new InputError('Invalid sequence');
    await viewExecution(
      stateRoot(),
      positionals[1]!,
      command === 'follow',
      !!values.json,
      after,
      this.signal,
    );
    return;
  }
}
