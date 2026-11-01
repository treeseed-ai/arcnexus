import { InputError } from '../architecture/config.js';
import { ProposalStore, TaskPlanner, TaskRunner } from '../task-intake/tasks.js';
import { lock, stateRoot } from '../workspace/state.js';
export class TaskCommand {
  constructor(
    private positionals: string[],
    private values: Record<string, string | boolean | undefined>,
    private signal: AbortSignal,
  ) {}
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
