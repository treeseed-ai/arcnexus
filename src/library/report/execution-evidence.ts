import { git } from '../operations/process.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import type { ExecutionAssignment, ExecutionRun } from '../coordination-store/execution-types.js';
import type { RecordData } from '../workspace/state.js';

/** Projects current-run host observations without granting arbitrary access to private state files. */
export class ExecutionEvidence {
  /** Retains the authoritative store and private evidence root used to validate record references. */
  constructor(
    private readonly root: string,
    private readonly store: ExecutionStore,
  ) {}

  /** Captures ordered coordination, provenance and observed work independently of worker summaries. */
  capture(runId: string) {
    const run = this.store.run(runId);
    const assignments = this.store.assignments(runId);
    const ids = new Set([runId, ...assignments.map((assignment) => assignment.id)]);
    return {
      schemaVersion: 1,
      basis:
        'Host-retained intent and observations. Request acceptance and turn completion are not verified delivery.',
      run: {
        id: run.id,
        mode: run.mode,
        objective: run.objective,
        createdAt: run.createdAt,
        authorityBase: run.data.authorityBase,
        candidateRevision: run.data.candidateRevision,
        initialCandidateRevision: run.data.initialCandidateRevision,
        initialCandidateSourceRun: run.data.initialCandidateSourceRun,
      },
      events: this.store
        .events()
        .filter((event) =>
          Object.values(event.data).some((value) => typeof value === 'string' && ids.has(value)),
        ),
      requests: this.requests(assignments, ids),
      source: this.source(run),
      assignments: assignments.map((assignment) => this.assignment(assignment)),
    };
  }

  /** Emits each durable request once, excluding any coordination outside the current run. */
  private requests(assignments: ExecutionAssignment[], ids: Set<string>) {
    return assignments.flatMap((assignment) =>
      this.store
        .inbox(assignment.id)
        .filter((request) => request.from === assignment.id && ids.has(request.assignmentId)),
    );
  }

  /** Observes the caller checkout independently of the editable assignment workspaces. */
  private source(run: ExecutionRun): unknown {
    const source = (run.data.workspace as RecordData | undefined)?.source;
    if (!source)
      return { evidenceUnavailable: true, reason: 'Source workspace has not been prepared' };
    try {
      return {
        path: source,
        head: git(source, 'rev-parse', 'HEAD').trim(),
        status: git(source, 'status', '--porcelain', '--untracked-files=all'),
      };
    } catch (error) {
      return { evidenceUnavailable: true, reason: String(error) };
    }
  }

  /** Separates captured assignment intent and verified delivery references from activation observations. */
  private assignment(assignment: ExecutionAssignment) {
    return {
      id: assignment.id,
      owner: assignment.owner,
      objective: assignment.objective,
      acceptance: assignment.acceptance,
      status: assignment.status,
      dependencies: assignment.dependencies,
      milestones: assignment.data.milestones,
      deliveredRevision: assignment.data.deliveredRevision,
      verification: assignment.evidence,
      record: this.record(assignment.runId, assignment),
    };
  }

  /** Resolves only matching current-run records and makes missing evidence explicit instead of substituting it. */
  private record(runId: string, assignment: ExecutionAssignment): unknown {
    const id = assignment.data.recordId;
    if (!id) return null;
    try {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
        throw new Error('Invalid retained record identity');
      const record = JSON.parse(
        readFileSync(join(this.root, 'runs', id, 'report.json'), 'utf8'),
      ) as RecordData;
      if (
        record.id !== id ||
        record.executionRunId !== runId ||
        record.assignmentId !== assignment.id
      )
        throw new Error('Retained record belongs to a different run or assignment');
      return this.observations(record);
    } catch (error) {
      return { evidenceUnavailable: true, reason: String(error) };
    }
  }

  /** Includes host-observed turn/checkpoint data while leaving worker claims in their separate report fields. */
  private observations(record: RecordData) {
    return {
      recordId: record.id,
      source: record.source,
      base: record.base,
      status: record.status,
      stage: record.stage,
      nextStage: record.nextStage,
      threadId: record.threadId,
      checkpoint: record.checkpoint,
      safeCheckpoint: record.safeCheckpoint,
      turns: record.turns,
      commands: record.commands,
      operations: record.operations,
      currentOperation: record.currentOperation,
      regressionCheckpoint: record.regressionCheckpoint,
      finalVerifiedBase: record.finalVerifiedBase,
      finalVerifiedDigest: record.finalVerifiedDigest,
      reconciliationId: record.reconciliationId,
    };
  }
}
