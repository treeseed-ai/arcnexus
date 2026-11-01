import {
  OperationArguments,
  OperationOrder,
  type OperationContext,
} from '../operations/operation-definition.js';
import type { Operation } from '../operations/operations.js';
import type { Catalog, Component } from './components.js';
import { InputError } from './config.js';

/** Captures finite lifecycle plans and agent availability from a single definition registry. */
export class ComponentOperationPlans {
  /** Retains revision-bound definitions; no command executes during catalog resolution. */
  constructor(private readonly catalog: Catalog) {}

  /** Resolves every executable component independently of the number of participating owners. */
  resolve(): void {
    for (const c of Object.values(this.catalog.components)) {
      if (c.schemaVersion !== 5 || ['platform', 'package'].includes(c.type)) continue;
      c.operationPlan = {};
      const context = this.context(c);
      for (const usage of ['preflight', 'setup', 'refresh', 'verify', 'agent'])
        c.operationPlan[usage] = this.plan(c, context, usage);
      c.verification = c.operationPlan.verify!.map((op) => {
        if (op.kind === 'http')
          throw new InputError(`HTTP verification requires a managed service checkpoint: ${op.id}`);
        return op;
      });
    }
  }

  /** Supplies only owner authority and validated test metadata captured by the host. */
  private context(c: Component): OperationContext {
    const profile = this.catalog.configurationSources.find(
      (s) =>
        s.path.startsWith('architecture/test-profiles/') &&
        (s.value as { id?: string }).id === c.testProfile,
    );
    return {
      ownerId: c.id,
      ownedPaths: [...c.allowedWritePaths],
      packageRoot: c.repositoryRoot!,
      ...(c.testProfile
        ? {
            selectedTestFiles: (c.capturedTests ?? []).map((t) => t.source),
            testOutputRoot: (profile?.value as { outputRoot?: string } | undefined)?.outputRoot,
          }
        : {}),
    };
  }

  /** Orders prerequisites and prevents services or incompatible owners from entering finite checkpoints. */
  private plan(c: Component, context: OperationContext, usage: string): Operation[] {
    const ids = Object.entries(c.operations ?? {})
      .filter(([, usages]) => usages.includes(usage))
      .map(([id]) => id);
    return new OperationOrder(this.catalog.operations).resolve(ids).map((op) => {
      if (op.schemaVersion !== 4)
        throw new InputError(`Migrate operation ${op.id} to schemaVersion 4`);
      if (op.repository !== c.repository)
        throw new InputError(`Operation repository mismatch: ${op.id}`);
      if (usage !== 'agent' && op.kind === 'service')
        throw new InputError(`Required lifecycle operations must be finite: ${op.id}`);
      if (
        !op.activities.every((activity) =>
          this.catalog.roles[c.role]!.activities.includes(activity),
        )
      )
        throw new InputError(`Operation activity outside role: ${op.id}`);
      if (!this.catalog.profiles[c.executionProfile]!.operationCategories?.includes(op.category))
        throw new InputError(`Operation category not permitted: ${op.id}`);
      return new OperationArguments().capture(op, context);
    });
  }
}
