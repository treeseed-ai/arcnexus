import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ConfigurationReader } from '../../library/architecture/configuration.js';
import {
  PromptExperimentResolver,
  resolveExperiment,
} from '../../library/experiments/experiment-config.js';
import { PromptExperimentRunner } from '../../library/experiments/experiments.js';
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
    const action = this.action();
    const definition = new ConfigurationReader().file(positionals[2]!).value as {
      schemaVersion?: number;
    };
    if (definition.schemaVersion === 3) return this.prompt(action);
    if (action === 'run')
      throw new InputError(
        'Legacy campaign execution is retired; migrate to schemaVersion 3 prompts and task run',
      );
    const input = resolveExperiment(
      positionals[2]!,
      values.bindings!,
      values.mode as 'simulation' | 'live' | undefined,
    );
    if (action === 'inspect') {
      console.log(JSON.stringify(input, null, values.json ? undefined : 2));
      return;
    }
  }

  /** Validates the shared experiment CLI contract before selecting a versioned runner. */
  private action(): string {
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
    return action!;
  }

  /** Routes prompt campaigns through the shared task host while preserving legacy inspection. */
  private async prompt(action: string): Promise<void> {
    let input;
    try {
      input = new PromptExperimentResolver().resolve(
        this.positionals[2]!,
        this.values.bindings as string,
        this.values.mode as 'simulation' | 'live' | undefined,
      );
    } catch (error) {
      throw new InputError(String(error));
    }
    if (action === 'inspect') {
      console.log(JSON.stringify(input, null, this.values.json ? undefined : 2));
      return;
    }
    const output = this.values.output ?? join(stateRoot(), 'experiment-' + randomUUID());
    const result = await new PromptExperimentRunner(this.signal).run(input, output);
    process.exitCode = result.status === 'passed' ? 0 : result.status === 'cancelled' ? 130 : 1;
    console.log(
      JSON.stringify({ status: result.status, evidenceMode: result.evidenceMode, output }),
    );
  }
}
