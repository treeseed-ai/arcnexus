import { InputError } from '../../library/architecture/config.js';
import { ProposalStore, TaskPlanner, TaskRunner } from '../../library/task-intake/tasks.js';
import { lock, stateRoot } from '../../library/workspace/state.js';

/** Adapts task planning, inspection and accepted execution to the public CLI. */
export class TaskCommand {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private positionals: string[],
    private values: Record<string, string | boolean | undefined>,
    private signal: AbortSignal,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const action = this.positionals[1];
    this.validate(action);
    const root = stateRoot();
    if (action === 'inspect') {
      console.log(
        JSON.stringify(
          new ProposalStore(root).load(this.positionals[2]!),
          null,
          this.values.json ? undefined : 2,
        ),
      );
      return;
    }
    const unlock = lock(root);
    try {
      if (action === 'plan') console.log(JSON.stringify(await this.plan(root)));
      else {
        const result = await new TaskRunner(root, this.signal).run(this.positionals[2]!);
        console.log(JSON.stringify(result.report));
        process.exitCode = result.exitCode;
      }
    } finally {
      unlock();
    }
  }

  /** Reads the caller’s request text and invokes retained task planning. */
  private plan(root: string) {
    return new TaskPlanner(root, this.signal).plan({
      input: this.values.input as string,
      project: this.values.project as string,
      base: this.values.base as string | undefined,
      bindings: this.values.bindings as string | undefined,
      initializerModel: this.values['initializer-model'] as string | undefined,
      executable: (this.values['codex-path'] as string | undefined) ?? 'codex',
    });
  }

  /** Rejects inputs that violate the captured configuration contract. */
  private validate(action?: string): void {
    const allowed =
      action === 'plan'
        ? ['input', 'project', 'base', 'bindings', 'initializer-model', 'codex-path']
        : action === 'inspect'
          ? ['json']
          : [];
    if (
      !action ||
      !['plan', 'inspect', 'run'].includes(action) ||
      Object.keys(this.values).some((key) => !allowed.includes(key))
    )
      throw new InputError('Invalid task command or options');
    if (
      action === 'plan'
        ? this.positionals.length !== 2 || !this.values.input || !this.values.project
        : this.positionals.length !== 3
    )
      throw new InputError(
        'task plan requires --input and --project; task inspect/run require a proposal ID',
      );
  }
}
