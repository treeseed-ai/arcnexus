import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recoverAssignmentEdits } from '../assignment/steward.js';
import type { ExecutionAssignment } from '../coordination-store/execution-types.js';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import { save, type RecordData } from '../workspace/state.js';

/** Reconciles known edits before dispatch while leaving uncertain activations interrupted. */
export class AssignmentRecovery {
  /** Uses the host's authoritative store and private assignment evidence. */
  constructor(
    private readonly root: string,
    private readonly store: ExecutionStore,
  ) {}

  /** Recovers filesystem intent without reissuing commands or marking a stage checkpoint safe. */
  recover(): void {
    for (const run of this.store.runs()) {
      for (const assignment of this.store.assignments(run.id)) {
        if (assignment.status !== 'running' || !assignment.data.recordId) continue;
        const path = join(this.root, 'runs', String(assignment.data.recordId), 'report.json');
        if (!existsSync(path)) continue;
        const record = JSON.parse(readFileSync(path, 'utf8')) as RecordData;
        try {
          this.identity(record, assignment);
          if (this.operations(record))
            this.interrupt(assignment, 'Operation completion is uncertain');
          if (recoverAssignmentEdits(this.root, record))
            this.interrupt(
              assignment,
              'Known edits recovered; activation checkpoint remains interrupted',
            );
        } catch (error) {
          this.interrupt(assignment, `Checked edit recovery requires attention: ${String(error)}`);
        }
      }
    }
  }

  /** Requires checked-edit evidence to belong to the same durable assignment. */
  private identity(record: RecordData, assignment: ExecutionAssignment): void {
    const authority = record.resolvedAssignment as
      { context?: Array<{ schemaVersion: number }> } | undefined;
    if (
      record.id !== assignment.data.recordId ||
      (authority?.context?.at(-1)?.schemaVersion === 5 && record.assignmentId !== assignment.id)
    )
      throw new Error('Assignment evidence identity changed');
  }

  /** Marks lost operation intent as uncertain and preserves every observed result and artifact. */
  private operations(record: RecordData): boolean {
    const invocations = (record.operationInvocations ?? []) as Array<{ status: string }>;
    const uncertain = invocations.some((item) => ['running', 'interrupted'].includes(item.status));
    for (const invocation of invocations)
      if (invocation.status === 'running') invocation.status = 'interrupted';
    if (uncertain) {
      record.safeCheckpoint = false;
      record.status = 'interrupted';
    }
    if (invocations.length) save(this.root, record);
    return uncertain;
  }

  /** Quarantines incompatible pending outcomes rather than committing delivery over uncertain evidence. */
  private interrupt(assignment: ExecutionAssignment, reason: string): void {
    this.store.updateAssignment(assignment.id, 'interrupted', {
      reason,
      pendingOutcome: null,
      lastFailedOutcome: assignment.data.pendingOutcome ?? null,
    });
  }
}
