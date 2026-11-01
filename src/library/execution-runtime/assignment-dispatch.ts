import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, type ProjectExecution } from '../architecture/execution-context.js';
import { validateContinuation } from '../assignment/steward.js';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import type { ExecutionRun, ExecutionAssignment } from '../coordination-store/execution-types.js';
import type { DirectorResult } from '../task-intake/direction.js';
import { save, type RecordData } from '../workspace/state.js';
import { ProgressObserver } from '../report/progress.js';
import { candidateDigest } from '../change-inspection/changes.js';

/** Validates proposed work and retained continuations before changing scheduling readiness. */
export class AssignmentDispatch {
  /** Shares captured authority and the sole project store with lifecycle policy. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
    private readonly store: ExecutionStore,
  ) {}

  /** Validates every scope and checkpoint before any proposal can become runnable. */
  apply(run: ExecutionRun, result: DirectorResult): void {
    for (const proposal of result.assignments) {
      const { ownerId, ...assignment } = proposal;
      new ExecutionContext().assignment(this.context, ownerId, {
        schemaVersion: 3,
        ...assignment,
        expectedOutcome: proposal.objective,
        hostChecks: [],
      });
    }
    const continuations = result.continuations.filter((item) => this.eligible(run, item));
    this.store.continueAssignments(run.id, continuations);
    for (const proposal of result.assignments) {
      const assignment = this.store.enqueue(
        run.id,
        proposal.ownerId,
        proposal.objective,
        proposal.acceptanceCriteria,
      );
      this.store.updateAssignment(assignment.id, 'ready', { proposal });
    }
  }

  /** Isolates an exhausted diagnosis loop to its workday assignment while preserving task goal failure. */
  private eligible(
    run: ExecutionRun,
    continuation: DirectorResult['continuations'][number],
  ): boolean {
    try {
      this.validate(run, continuation);
      return true;
    } catch (error) {
      if (run.mode !== 'workday' || !(error instanceof Error) || error.name !== 'NeedsAttention')
        throw error;
      this.store.fail(continuation.assignmentId, 'failed', error.message);
      return false;
    }
  }

  /** Refuses scope substitution and uncertain operations while preserving accepted engineering evidence. */
  private validate(run: ExecutionRun, continuation: DirectorResult['continuations'][number]): void {
    const assignment = this.store.assignment(continuation.assignmentId);
    if (assignment.runId !== run.id || assignment.owner !== continuation.ownerId)
      throw new Error('Continuation must name an existing owner assignment in this run');
    if (!['blocked', 'failed', 'rejected'].includes(assignment.status))
      throw new Error('Continuation cannot reopen active or completed work');
    if (!assignment.data.recordId) return;
    const record = JSON.parse(
      readFileSync(
        join(this.root, 'runs', String(assignment.data.recordId), 'report.json'),
        'utf8',
      ),
    ) as RecordData;
    const pending = assignment.data.reconciliation as { recordId: string } | null;
    if (pending && pending.recordId !== record.reconciliationId)
      throw new Error('Continuation has uncertain workspace preparation');
    validateContinuation(this.root, record);
    this.diagnose(record, assignment);
  }

  /** Counts equivalent observed blockers across continuations without introducing a retry quota. */
  private diagnose(record: RecordData, assignment: ExecutionAssignment): void {
    record.continuationLoopWarning = new ProgressObserver(this.root, record).failed(
      { activity: 'retained-blocker' },
      String(assignment.data.reason),
      candidateDigest(record),
    );
    save(this.root, record);
  }
}
