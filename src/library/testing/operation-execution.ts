import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OperationExecution } from '../operations/operation-execution.js';
import { git } from '../operations/process.js';
import { save, stateRoot, type RecordData } from '../workspace/state.js';
import { assertCapturedTests } from './captured-tests.js';
import type { TestExecution } from './testing.js';

/** Routes test preparation and running through the same confined executor as agent and host checks. */
export class SharedTestExecution {
  private readonly root = stateRoot();

  private readonly record: RecordData;

  /** Creates private operation evidence before dispatch without creating an engineering assignment. */
  constructor(
    private readonly result: TestExecution,
    private readonly signal: AbortSignal,
  ) {
    const { selection } = result;
    const id = randomUUID();
    this.record = {
      id,
      source: selection.project,
      workspace: selection.project,
      base: selection.revision,
      branch: git(selection.project, 'branch', '--show-current').trim(),
      commonDir: git(
        selection.project,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ).trim(),
      environment: selection.operationPlan!.environment,
      bindings: selection.bindings,
      operationCatalog: selection.operationPlan!.catalog,
      testEvidence: result.evidence,
      status: 'running',
      startedAt: new Date().toISOString(),
      commands: [],
    };
    mkdirSync(join(this.root, 'runs', id), { recursive: true, mode: 0o700 });
    result.operationEvidence = join(this.root, 'runs', id, 'report.json');
    save(this.root, this.record);
  }

  /** Deduplicates equivalent preparation while keeping each owner's selected runner invocation explicit. */
  async run(productionBuilt: boolean): Promise<void> {
    const plan = this.result.selection.operationPlan!;
    try {
      for (const component of plan.catalog)
        if (this.result.selection.suites.some((s) => s.component === component.id))
          assertCapturedTests(component, this.record.workspace);
      await this.invoke(
        plan.steps.filter((step) => !(productionBuilt && step.purpose === 'production')),
      );
      this.record.status = 'completed';
    } catch (error) {
      this.record.status = this.signal.aborted ? 'cancelled' : 'failed';
      this.record.error = String(error);
      throw error;
    } finally {
      save(this.root, this.record);
    }
  }

  /** Preserves the supervised command result even when a test or preparation operation fails. */
  private async invoke(
    steps: import('./operation-plan.js').TestOperationPlan['steps'],
  ): Promise<void> {
    try {
      await new OperationExecution(this.root, this.record, this.signal).steps(steps);
    } finally {
      const invocations = this.record.operationInvocations as
        | Array<{
            result?: import('../operations/process.js').CommandResult;
          }>
        | undefined;
      for (const invocation of invocations ?? [])
        if (invocation.result) this.result.commands.push(invocation.result);
    }
  }
}
