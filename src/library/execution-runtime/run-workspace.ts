import { join } from 'node:path';
import type { ProjectExecution } from '../architecture/execution-context.js';
import type { ExecutionRun } from '../coordination-store/execution-types.js';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import { CandidateSnapshots } from '../workspace/candidates.js';
import { assertIdentity, createWorkspace, prepareWorkspace } from '../workspace/workspace.js';
import type { RecordData } from '../workspace/state.js';

/** Materializes policy context from immutable verified snapshots and journals uncertain setup. */
export class RunWorkspace {
  private readonly snapshots: CandidateSnapshots;

  /** Uses captured source authority and the same transactional project store as dispatch. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
    private readonly store: ExecutionStore,
  ) {
    this.snapshots = new CandidateSnapshots(context.source, join(root, 'snapshots'));
  }

  /** Creates fresh planning context without treating a mutable delivery directory as authoritative. */
  async prepare(run: ExecutionRun, signal: AbortSignal): Promise<void> {
    const latest = this.store.latestDelivery(this.context.base, this.context.packageId);
    const revision = String(latest?.data.candidateRevision ?? this.context.base);
    const record = createWorkspace(this.root, {
      project: this.context.source,
      authorityBase: this.context.base,
      base: revision,
      bindings: this.context.bindings,
    });
    record.executionRunId = run.id;
    this.store.updateRun(run.id, this.store.run(run.id).status, {
      workspace: record,
      workspacePrepared: false,
      initialCandidateRevision: run.data.initialCandidateRevision ?? revision,
      initialCandidateSourceRun: run.data.initialCandidateRevision
        ? run.data.initialCandidateSourceRun
        : (latest?.id ?? null),
      previousPolicyWorkspaces: [
        ...((run.data.previousPolicyWorkspaces ?? []) as unknown[]),
        ...(run.data.workspace ? [(run.data.workspace as RecordData).id] : []),
      ],
    });
    await prepareWorkspace(this.root, record, signal);
    this.validate(record, revision);
    this.store.updateRun(run.id, this.store.run(run.id).status, {
      workspace: record,
      workspacePrepared: true,
      candidateRevision: revision,
    });
  }

  /** Returns validated policy source for the current candidate, retaining previous workspaces as evidence. */
  async policy(run: ExecutionRun, signal: AbortSignal): Promise<RecordData> {
    let record = run.data.workspace as RecordData;
    if (!record || record.base !== run.data.candidateRevision) {
      await this.prepare(run, signal);
      run = this.store.run(run.id);
      record = run.data.workspace as RecordData;
    }
    if (run.data.workspacePrepared !== true)
      throw new Error('Workspace preparation was interrupted; inspect retained command evidence');
    this.validate(record, String(run.data.candidateRevision));
    return record;
  }

  /** Retains altered contents in a private snapshot and prevents policy from trusting them. */
  private validate(record: RecordData, revision: string): void {
    try {
      assertIdentity(record);
      const observed = this.snapshots.capture(record.workspace, revision);
      if (observed !== revision)
        throw new Error(
          `Policy workspace differs from verified snapshot ${revision}; retained ${observed}`,
        );
    } catch (error) {
      throw Object.assign(new Error(String(error)), { name: 'CandidateIntegrityError' });
    }
  }
}
