import { loadBindings } from '../../library/architecture/bindings.js';
import { InputError } from '../../library/architecture/config.js';
import { ComponentTesting } from '../../library/testing/testing.js';

/** Adapts component test requests to the shared selection and execution service. */
export class TestCommand {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private readonly positionals: string[],
    private readonly values: Record<string, string | boolean | undefined>,
    private readonly tags: string[],
    private readonly signal: AbortSignal,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const action = this.positionals[1];
    if (
      !['inspect', 'run'].includes(action ?? '') ||
      this.positionals.length > 3 ||
      typeof this.values.project !== 'string'
    )
      throw new InputError('Expected test inspect|run [component-id] --project <repository>');
    if (
      Object.keys(this.values).some(
        (key) =>
          !['project', 'json', 'level', 'category', 'timeout-seconds', 'bindings'].includes(key),
      )
    )
      throw new InputError('Unsupported test command option');
    const service = new ComponentTesting();
    const selection = service.inspect(
      this.values.project,
      {
        component: this.positionals[2],
        level: this.values.level as string | undefined,
        category: this.values.category as string | undefined,
        tags: this.tags,
      },
      loadBindings(this.values.bindings as string | undefined),
    );
    const result = action === 'run' ? await service.run(selection, this.signal) : selection;
    console.log(JSON.stringify(result, null, this.values.json ? undefined : 2));
    if ('exitCode' in result) process.exitCode = result.exitCode;
  }
}
