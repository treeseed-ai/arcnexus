import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { resolveExperiment } from '../../library/experiments/experiment-config.js';
import { ExperimentRunner } from '../../library/experiments/experiments.js';
import { stateRoot } from '../../library/workspace/state.js';
import { InputError } from '../../library/architecture/config.js';
import type { CliValues } from './arguments.js';

/** Adapts experiment commands without duplicating runtime orchestration. */
export class ExperimentCommand {
  /** Retains experiment arguments and the caller cancellation signal. */
  constructor(
    private readonly positionals: string[],
    private readonly values: CliValues,
    private readonly signal: AbortSignal,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const { values, positionals } = this;
    const action = positionals[1];
    if (
      positionals.length !== 3 ||
      !['inspect', 'run'].includes(action ?? '') ||
      !values.bindings ||
      Object.keys(values).some((key) => !['bindings', 'mode', 'output', 'json'].includes(key))
    )
      throw new InputError('experiment inspect/run requires manifest and --bindings');
    if (action === 'run' && !['simulation', 'live'].includes(values.mode ?? ''))
      throw new InputError('Experiment requires explicit --mode simulation|live');
    if (action === 'inspect' && (values.mode || values.output))
      throw new InputError('inspect accepts only --bindings and --json');
    const input = resolveExperiment(
      positionals[2]!,
      values.bindings,
      values.mode as 'simulation' | 'live' | undefined,
    );
    if (action === 'inspect') {
      console.log(JSON.stringify(input, null, values.json ? undefined : 2));
      return;
    }
    const output = values.output ?? join(stateRoot(), 'experiment-' + randomUUID());
    const campaign = await new ExperimentRunner(this.signal).run(input, output);
    process.exitCode = campaign.status === 'passed' ? 0 : campaign.status === 'cancelled' ? 130 : 1;
    console.log(
      JSON.stringify({ status: campaign.status, evidenceMode: campaign.evidenceMode, output }),
    );
  }
}
