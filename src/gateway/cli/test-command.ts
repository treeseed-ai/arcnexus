import { InputError } from '../../library/architecture/config.js';
import { ComponentTesting } from '../../library/testing/testing.js';

/** Adapts component test requests to the shared selection and execution service. */
export class TestCommand {
  constructor(
    private readonly positionals: string[],
    private readonly values: Record<string, string | boolean | undefined>,
    private readonly tags: string[],
    private readonly signal: AbortSignal,
  ) {}

  async run(): Promise<void> {
    const action = this.positionals[1];
    if (
      !['inspect', 'run'].includes(action ?? '') ||
      this.positionals.length > 3 ||
      typeof this.values.project !== 'string'
    )
      throw new InputError('Expected test inspect|run [component-id] --project <repository>');
    const service = new ComponentTesting();
    const selection = service.inspect(this.values.project, {
      component: this.positionals[2],
      level: this.values.level as string | undefined,
      category: this.values.category as string | undefined,
      tags: this.tags,
    });
    const result = action === 'run' ? await service.run(selection, this.signal) : selection;
    console.log(JSON.stringify(result, null, this.values.json ? undefined : 2));
    if ('exitCode' in result) process.exitCode = result.exitCode;
  }
}
