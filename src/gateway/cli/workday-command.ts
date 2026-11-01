import { resolveWorkday } from '../../library/workday/workday-config.js';
import { stateRoot } from '../../library/workspace/state.js';
import { InputError } from '../../library/architecture/config.js';
import type { CliValues } from './arguments.js';

/** Adapts workday commands without duplicating runtime orchestration. */
export class WorkdayCommand {
  constructor(
    private readonly positionals: string[],
    private readonly values: CliValues,
    private readonly signal: AbortSignal,
    private readonly acquire: () => string,
  ) {}
  async run(): Promise<void> {
    const action = this.positionals[1];
    if (this.positionals.length !== 3)
      throw new InputError('workday requires action and manifest/identity');
    if (action === 'inspect') return this.inspectWorkday();
    if (action === 'run') return this.runWorkday();
    if (action === 'status' || action === 'follow') return this.viewWorkday();
    throw new InputError('Unknown workday action');
  }

  private inspectWorkday(): void {
    const { values, positionals } = this;
    if (
      !values.project ||
      Object.keys(values).some(
        (k) => !['project', 'base', 'bindings', 'json', 'initializer-model'].includes(k),
      )
    )
      throw new InputError('workday inspect requires --project');
    console.log(
      JSON.stringify(
        resolveWorkday(
          positionals[2]!,
          values.project,
          values.base,
          values.bindings,
          {},
          values['initializer-model'],
        ),
        null,
        values.json ? undefined : 2,
      ),
    );
    return;
  }

  private async runWorkday(): Promise<void> {
    const { values, positionals } = this;
    if (
      !values.project ||
      Object.keys(values).some(
        (k) =>
          !['project', 'base', 'bindings', 'issue', 'codex-path', 'initializer-model'].includes(k),
      ) ||
      (values.issue !== undefined && !/^[1-9]\d*$/.test(values.issue))
    )
      throw new InputError('Invalid workday run arguments');
    const input = resolveWorkday(
      positionals[2]!,
      values.project,
      values.base,
      values.bindings,
      {},
      values['initializer-model'],
    );
    const root = this.acquire();
    const { WorkdayRunner } = await import('../../library/workday/workday.js');
    const result = await new WorkdayRunner(root, this.signal, values['codex-path'] ?? 'codex').run(
      input,
      values.issue,
    );
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
    return;
  }

  private async viewWorkday(): Promise<void> {
    const { values, positionals } = this;
    const action = positionals[1];
    if (
      Object.keys(values).some((k) => !['json', 'after'].includes(k)) ||
      (values.after !== undefined &&
        (action !== 'follow' ||
          !/^\d+$/.test(values.after) ||
          !Number.isSafeInteger(Number(values.after))))
    )
      throw new InputError('Invalid workday viewer arguments');
    const { viewWorkday } = await import('../../library/workday/workday-view.js');
    await viewWorkday(
      stateRoot(),
      positionals[2]!,
      action === 'follow',
      !!values.json,
      Number(values.after ?? 0),
      this.signal,
    );
    return;
  }
}
