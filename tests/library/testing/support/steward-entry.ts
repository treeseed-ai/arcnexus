import { parseArgs } from 'node:util';
import {
  resolveAssignment,
  resolveBase,
} from '../../../../dist/library/architecture/assignment.js';
import { loadBindings } from '../../../../dist/library/architecture/bindings.js';
import { InputError } from '../../../../dist/library/architecture/config.js';
import { runSteward } from '../../../../dist/library/assignment/steward.js';
import { captureChanges } from '../../../../dist/library/change-inspection/changes.js';
import { saveMarkdown } from '../../../../dist/library/report/report.js';
import { observe } from '../../../../dist/library/report/timeline.js';
import {
  lock,
  save,
  stateRoot,
  type RecordData,
} from '../../../../dist/library/workspace/state.js';
import { createWorkspace } from '../../../../dist/library/workspace/workspace.js';

/** Invokes the public session API in a subprocess for low-level characterization, outside the product CLI. */
class StewardEntry {
  private readonly controller = new AbortController();

  private record?: RecordData;

  private root?: string;

  private unlock?: () => void;

  private timer?: NodeJS.Timeout;

  private readonly cancel = () => this.controller.abort(new Error('Cancelled'));

  /** Retains signal/exit evidence around the same assembled session used by project execution. */
  async run(): Promise<void> {
    process.on('SIGINT', this.cancel);
    process.on('SIGTERM', this.cancel);
    try {
      await this.execute();
    } catch (error) {
      this.failure(error);
    } finally {
      clearTimeout(this.timer);
      this.finalize();
      this.unlock?.();
      process.off('SIGINT', this.cancel);
      process.off('SIGTERM', this.cancel);
    }
  }

  /** Captures test-supplied authority and explicit historical settings without enabling a product mode. */
  private async execute(): Promise<void> {
    const { values, positionals } = this.arguments();
    const { source, base, bindings, resolved } = this.capture(values, positionals);
    this.root = stateRoot();
    this.unlock = lock(this.root);
    this.record = createWorkspace(this.root, {
      project: source,
      base,
      bindings,
      issue: values.issue,
    });
    this.record.resolvedAssignment = resolved;
    this.watchdog(resolved.executionProfile.timeoutSeconds);
    await runSteward(
      this.root,
      this.record,
      positionals[1]!,
      resolved.assignment.objective,
      resolved.executionProfile.model,
      values['codex-path'] ?? 'codex',
      this.controller.signal,
      values['max-attempts']
        ? Number(values['max-attempts'])
        : resolved.executionProfile.maxAttempts,
    );
  }

  /** Applies only an explicitly requested characterization watchdog to its test subprocess. */
  private watchdog(seconds?: number): void {
    if (seconds === undefined) return;
    this.timer = setTimeout(
      () => this.controller.abort(new Error('Operation timed out')),
      seconds * 1000,
    );
  }

  /** Resolves committed component authority before any workspace is created. */
  private capture(values: Record<string, string | undefined>, positionals: string[]) {
    const bindings = loadBindings(values.bindings);
    const { source, base } = resolveBase(values.project!, values.base);
    const resolved = resolveAssignment(source, base, positionals[1]!, {
      objective: positionals[2],
      bindings,
      file: values.assignment,
      kind: values.kind,
      compositionProfile: values['composition-profile'],
      executionProfile: values['execution-profile'],
      model: values.model,
      initializerModel: values['initializer-model'],
      timeoutSeconds: values['timeout-seconds'] ? Number(values['timeout-seconds']) : undefined,
    });
    return { source, base, bindings, resolved };
  }

  /** Accepts only the explicit fields needed by session characterization scenarios. */
  private arguments() {
    const names = [
      'project',
      'base',
      'bindings',
      'issue',
      'assignment',
      'kind',
      'model',
      'composition-profile',
      'execution-profile',
      'initializer-model',
      'codex-path',
      'max-attempts',
      'timeout-seconds',
    ];
    const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]));
    const result = parseArgs({ allowPositionals: true, options });
    const { values, positionals } = result;
    if (
      positionals[0] !== 'run' ||
      !values.project ||
      positionals.length !== (values.assignment ? 2 : 3)
    )
      throw new InputError('Session test requires component, objective and --project');
    if (values['max-attempts'] && !/^[1-9]\d*$/.test(values['max-attempts']))
      throw new InputError('Invalid explicit test attempts');
    return result;
  }

  /** Preserves the session's failure classification and public subprocess exit semantics. */
  private failure(error: unknown): void {
    const cancelled =
      this.controller.signal.aborted &&
      String(this.controller.signal.reason) === 'Error: Cancelled';
    const invalid =
      error instanceof InputError ||
      (error instanceof Error &&
        'code' in error &&
        String(error.code).startsWith('ERR_PARSE_ARGS'));
    process.exitCode = cancelled ? 130 : invalid ? 2 : 1;
    if (this.record) {
      if (cancelled) this.record.status = 'cancelled';
      else if (!['blocked', 'no_changes', 'needs_attention'].includes(this.record.status))
        this.record.status = 'failed';
      this.record.error = String(error);
    }
    console.error(String(error));
  }

  /** Captures actual changes and ordered final evidence for subprocess assertions. */
  private finalize(): void {
    if (!this.root || !this.record) return;
    const record = this.record;
    record.outcome ??= record.status;
    record.finishedAt = new Date().toISOString();
    record.elapsedMs = Date.now() - Date.parse(record.startedAt);
    try {
      captureChanges(this.root, record);
    } catch (error) {
      record.evidenceError = String(error);
      process.exitCode = 1;
    }
    observe(this.root, record, 'run.finalized', { status: record.status, outcome: record.outcome });
    save(this.root, record);
    saveMarkdown(this.root, record);
    console.log(JSON.stringify(record));
  }
}

await new StewardEntry().run();
