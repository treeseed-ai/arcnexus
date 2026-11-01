import { GuidanceValidator } from '../../library/guidance-validation/guidance.js';
import { InputError } from '../../library/architecture/config.js';
import type { CliValues } from './arguments.js';

/** Adapts guidance commands without duplicating runtime orchestration. */
export class GuidanceCommand {
  constructor(
    private readonly positionals: string[],
    private readonly values: CliValues,
    private readonly signal: AbortSignal,
  ) {}
  run(): void {
    const { values, positionals } = this;
    if (
      positionals.length !== 2 ||
      positionals[1] !== 'validate' ||
      !values.project ||
      Object.keys(values).some((key) => !['project', 'json'].includes(key))
    )
      throw new InputError('guidance validate requires --project and optional --json');
    const report = new GuidanceValidator().validate(values.project);
    if (values.json) console.log(JSON.stringify(report));
    else {
      console.log(
        `Validated ${report.skills.filter((skill) => skill.valid).length} skills; inventoried ${report.agents.length} AGENTS.md files (readability only)`,
      );
      for (const diagnostic of report.diagnostics)
        console.error(`${diagnostic.path}: ${diagnostic.message}`);
    }
    process.exitCode = report.status === 'valid' ? 0 : 1;
    return;
  }
}
