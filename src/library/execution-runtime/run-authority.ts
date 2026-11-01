import { executionIdentity, type ProjectExecution } from '../architecture/execution-context.js';
import { InputError } from '../architecture/config.js';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import type { ExecutionRun } from '../coordination-store/execution-types.js';

/** Prevents a replacement host from reinterpreting retained work under newly discovered authority. */
export class RunAuthority {
  readonly identity: string;

  /** Captures the host identity independently of mutable run projections and candidate source. */
  constructor(
    context: ProjectExecution,
    private readonly store: ExecutionStore,
  ) {
    this.identity = executionIdentity(context);
  }

  /** Rejects incompatible or pre-identity runs before any continuation or dispatch can occur. */
  assert(run: ExecutionRun): void {
    if (run.data.executionIdentity === this.identity) return;
    const reason = run.data.executionIdentity
      ? 'Captured source/package/bindings authority changed'
      : 'Retained run lacks a captured execution authority identity';
    throw new InputError(reason + '; stop/start the workday or submit a new task');
  }

  /** Preserves terminal history and quarantines incompatible unfinished runs without replacing candidates. */
  recover(): void {
    for (const run of this.store.runs()) {
      if (['completed', 'cancelled', 'failed', 'stopped'].includes(run.status)) continue;
      try {
        this.assert(run);
      } catch (error) {
        this.store.updateRun(run.id, 'needs_attention', { authorityError: String(error) });
      }
    }
  }
}
