import { catalogView } from '../../library/architecture/catalog-view.js';
import type { CliValues } from './arguments.js';
import { InputError } from '../../library/architecture/config.js';
import { resolveAssignment, resolveBase } from '../../library/architecture/assignment.js';
import { loadBindings } from '../../library/architecture/bindings.js';
import { loadCatalog } from '../../library/architecture/components.js';

/** Resolves immutable assignments and presents their captured authority. */
export class AssignmentCommand {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private readonly positionals: string[],
    private readonly values: CliValues,
    private readonly command: string,
  ) {}

  /** Projects captured ownership, contracts and inventories for static validation output. */
  catalog(): void {
    const { values, positionals } = this;
    if (!values.project || positionals.length !== 1)
      throw new InputError('validate requires --project');
    const { source, base } = resolveBase(values.project, values.base);
    const catalog = loadCatalog(
      source,
      base,
      values.bindings ? loadBindings(values.bindings) : undefined,
    );
    console.log(JSON.stringify({ base, ...catalogView(catalog), status: 'valid' }));
    return;
  }

  /** Resolves captured inputs and rejects unsupported or inconsistent configuration. */
  resolve() {
    const { values, positionals, command } = this;
    const bindings = loadBindings(values.bindings);
    const selection = ['run', 'inspect'].includes(command!)
      ? resolveBase(values.project!, values.base)
      : undefined;
    const resolved = selection
      ? resolveAssignment(selection.source, selection.base, positionals[1]!, {
          objective: positionals[2],
          bindings,
          file: values.assignment,
          kind: values.kind,
          compositionProfile: values['composition-profile'],
          executionProfile: values['execution-profile'],
          model: values.model,
          initializerModel: values['initializer-model'],
          timeoutSeconds:
            values['timeout-seconds'] === undefined ? undefined : Number(values['timeout-seconds']),
        })
      : undefined;
    return { bindings, selection, resolved };
  }
}
