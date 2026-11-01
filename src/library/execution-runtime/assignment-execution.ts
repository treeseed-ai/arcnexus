import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, type ProjectExecution } from '../architecture/execution-context.js';
import type { ResolvedAssignment, Assignment } from '../architecture/assignment.js';
import { StewardSession } from '../assignment/steward.js';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import type {
  ActivationResult,
  ExecutionAssignment,
} from '../coordination-store/execution-types.js';
import { CandidateSnapshots } from '../workspace/candidates.js';
import { createWorkspace, prepareWorkspace } from '../workspace/workspace.js';
import { save, type RecordData } from '../workspace/state.js';
import { Direction } from '../task-intake/direction.js';
import type { AgentResult } from '../steward/codex.js';

/** Executes one owner stage in an isolated workspace and verifies delivery before promotion. */
export class AssignmentExecution {
  private readonly snapshots: CandidateSnapshots;

  /** Captures authority and the project store independently of mutable candidate source. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
    private readonly store: ExecutionStore,
    private readonly signal: AbortSignal,
  ) {
    this.snapshots = new CandidateSnapshots(context.source, join(root, 'snapshots'));
  }

  /** Restores retained work, runs one stage and returns only a structured scheduler outcome. */
  async activate(assignment: ExecutionAssignment): Promise<ActivationResult> {
    const record = await this.record(assignment);
    const resolved = record.resolvedAssignment as ResolvedAssignment;
    const session = new StewardSession(
      this.root,
      record,
      assignment.owner,
      assignment.objective,
      resolved.executionProfile.model,
      this.context.executable,
      this.signal,
    );
    await session.step();
    const requests = record.pendingRequests as AgentResult['requests'] | undefined;
    if (requests?.length) {
      delete record.pendingRequests;
      save(this.root, record);
      return this.requests(assignment, requests);
    }
    if (record.status !== 'completed') return { kind: 'continue' };
    return this.deliver(assignment, record, session);
  }

  /** Loads an existing candidate or captures a new owner-scoped assignment. */
  private async record(assignment: ExecutionAssignment): Promise<RecordData> {
    if (typeof assignment.data.recordId === 'string') {
      const record = JSON.parse(
        readFileSync(join(this.root, 'runs', assignment.data.recordId, 'report.json'), 'utf8'),
      ) as RecordData;
      return this.refresh(assignment, record);
    }
    const run = this.store.run(assignment.runId);
    const base = String(run.data.candidateRevision ?? this.context.base);
    const value = this.value(assignment);
    const resolved = new ExecutionContext().assignment(this.context, assignment.owner, value);
    const record = createWorkspace(this.root, {
      project: this.context.source,
      base,
      bindings: this.context.bindings,
    });
    record.environment = resolved.environment;
    record.resolvedAssignment = resolved;
    record.directionAccepted = true;
    this.store.updateAssignment(assignment.id, 'running', {
      recordId: record.id,
      candidateBase: base,
    });
    save(this.root, record);
    return record;
  }

  /** Uses director-authored intent or the recipient's bounded request objective. */
  private value(assignment: ExecutionAssignment): Assignment {
    const proposed = assignment.data.proposal as Partial<Assignment> | undefined;
    return {
      schemaVersion: 3,
      kind: proposed?.kind ?? 'change',
      changeType: proposed?.changeType ?? 'behavior',
      objective: assignment.objective,
      expectedOutcome: assignment.objective,
      acceptanceCriteria: assignment.acceptance.length
        ? assignment.acceptance
        : [assignment.objective],
      allowedWritePaths: proposed?.allowedWritePaths,
      hostChecks: [],
    };
  }

  /** Incorporates verified deliveries without losing incomplete owner changes or frozen evidence. */
  private async refresh(assignment: ExecutionAssignment, record: RecordData): Promise<RecordData> {
    const current = String(
      this.store.run(assignment.runId).data.candidateRevision ?? this.context.base,
    );
    if (assignment.dependencies.length)
      record.coordinationContext =
        'Verified dependency deliveries: ' +
        JSON.stringify(assignment.dependencies.map((id) => this.store.assignment(id)));
    if (record.base === current) return record;
    const incoming = this.snapshots.capture(record.workspace, record.base);
    const merged = this.snapshots.reconcile(record.base, current, incoming);
    if (merged.status !== 'merged') throw new Error('Candidate conflict: ' + merged.evidence);
    const next = await this.materialize(record, current, merged.revision);
    record.previousWorkspaces = [
      ...((record.previousWorkspaces ?? []) as string[]),
      record.workspace,
    ];
    Object.assign(record, {
      workspace: next.workspace,
      branch: next.branch,
      base: current,
      coordinationContext:
        'Verified dependency deliveries: ' +
        JSON.stringify(assignment.dependencies.map((id) => this.store.assignment(id))),
    });
    if (record.nextStage === 'finished') record.nextStage = 'review';
    save(this.root, record);
    return record;
  }

  /** Materializes a reconciled candidate while retaining the owner's edits relative to the new base. */
  private async materialize(
    record: RecordData,
    current: string,
    revision: string,
  ): Promise<RecordData> {
    const next = createWorkspace(this.root, {
      project: this.context.source,
      base: current,
      bindings: this.context.bindings,
    });
    next.environment = record.environment;
    await prepareWorkspace(this.root, next, this.signal);
    const patch = execFileSync('git', [
      '-C',
      this.context.source,
      'diff',
      '--binary',
      current,
      revision,
    ]);
    if (patch.length)
      execFileSync('git', ['-C', next.workspace, 'apply', '--binary', '-'], { input: patch });
    return next;
  }

  /** Converts precise boundary requests to durable identities; unknown owners remain blockers. */
  private requests(
    assignment: ExecutionAssignment,
    requests: AgentResult['requests'],
  ): ActivationResult {
    if (requests.some((r) => !r.ownerId || !this.context.owners.includes(r.ownerId)))
      return { kind: 'blocked', reason: JSON.stringify(requests) };
    return {
      kind: 'request',
      requests: requests.map((r, index) => ({
        key: `${assignment.id}:${assignment.dependencies.length}:${index}`,
        owner: r.ownerId!,
        objective: r.request,
        acceptance: r.acceptanceCriteria,
      })),
    };
  }

  /** Independently reviews the assembled result before updating the verified candidate pointer. */
  private async deliver(
    assignment: ExecutionAssignment,
    record: RecordData,
    session: StewardSession,
  ): Promise<ActivationResult> {
    await session.verifyFinal();
    const evidence = await new Direction(this.root, this.context, this.signal).verify(
      record,
      assignment.owner,
      assignment.objective,
      { criteria: assignment.acceptance, commands: record.commands, worker: record.agent },
    );
    const revision = this.snapshots.capture(record.workspace, record.base);
    return {
      kind: 'completed',
      evidence,
      candidate: {
        candidateRevision: revision,
        candidateRecord: record,
        verifiedEvidence: evidence,
      },
    };
  }
}
