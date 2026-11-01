import { ExecutionEvidence } from '../report/report.js';
import { candidateDigest } from '../change-inspection/changes.js';
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
import { ProgressObserver } from '../report/progress.js';
import { Direction, VerificationIssue } from '../task-intake/direction.js';
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
    this.acknowledge(assignment, record);
    this.dependencyContext(assignment, record);
    record.inboxContext = this.store.inbox(assignment.id);
    record.continuationFeedback = [
      assignment.data.continuationReason,
      record.continuationLoopWarning,
    ]
      .filter(Boolean)
      .join('\n');
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
    if (Array.isArray(assignment.data.questions) && assignment.data.questions.length)
      return this.answer(assignment, record, session);
    if (!record.pendingRequests && !record.pendingInboxActions) await session.step();
    const result = await this.outcome(assignment, record, session);
    return { ...result, receipt: (record.checkpoint as { sha256: string }).sha256 };
  }

  /** Clears only outputs whose scheduler acknowledgement is durable; unacknowledged outputs replay. */
  private acknowledge(assignment: ExecutionAssignment, record: RecordData): void {
    const checkpoint = record.checkpoint as { sha256: string } | undefined;
    if (!checkpoint || assignment.data.lastReceipt !== checkpoint.sha256) return;
    delete record.pendingRequests;
    delete record.pendingInboxActions;
    save(this.root, record);
  }

  /** Applies inbox outcomes before considering a candidate eligible for independent delivery review. */
  private async outcome(
    assignment: ExecutionAssignment,
    record: RecordData,
    session: StewardSession,
  ): Promise<ActivationResult> {
    if (record.plan && !assignment.data.accepted) this.store.accept(assignment.id);
    const actions = record.pendingInboxActions as AgentResult['inboxActions'];
    const requests = record.pendingRequests as AgentResult['requests'] | undefined;
    if (requests?.length) {
      const routed = this.requests(assignment, record, requests);
      if (routed.kind === 'request' && actions?.length)
        return { kind: 'inbox', requests: routed.requests, actions };
      return routed;
    }
    if (actions?.length) return { kind: 'responses', actions };
    if (record.status === 'blocked') return { kind: 'blocked', reason: String(record.error) };
    if (record.status !== 'completed') return { kind: 'continue' };
    try {
      return await this.deliver(assignment, record, session);
    } catch (error) {
      if (!(error instanceof VerificationIssue)) throw error;
      return this.repair(record, error);
    }
  }

  /** Returns actionable independent findings to the existing assignment without resetting its evidence. */
  private repair(record: RecordData, issue: VerificationIssue): ActivationResult {
    const feedback = JSON.stringify(issue.result);
    const gaps = issue.result.criteria
      .filter((criterion) => criterion.verdict !== 'verified' || !criterion.evidence.length)
      .map((criterion) => criterion.index)
      .sort((left, right) => left - right);
    const warning = new ProgressObserver(this.root, record, 'independentProgress').failed(
      { activity: 'independent-verification' },
      JSON.stringify({ gaps, status: issue.result.status }),
      candidateDigest(record),
    );
    record.correctiveFeedback = warning ? `${feedback}\n${warning}` : feedback;
    record.independentFindings = issue.result;
    const assignment = (record.resolvedAssignment as ResolvedAssignment).assignment;
    record.nextStage = assignment.kind === 'change' ? 'implementation' : 'research';
    record.status = 'running';
    save(this.root, record);
    return { kind: 'continue' };
  }

  /** Runs a read-only correlated answer on the requester's retained thread. */
  private async answer(
    assignment: ExecutionAssignment,
    record: RecordData,
    session: StewardSession,
  ): Promise<ActivationResult> {
    const result = await session.reply(
      `Answer these correlated inbox questions without source edits. Return inboxActions with action=answer, exact requestId and text; requests=[]: ${JSON.stringify(assignment.data.questions)}`,
    );
    if (!result.inboxActions?.length) throw new Error('Clarification requires a correlated answer');
    record.pendingInboxActions = result.inboxActions;
    save(this.root, record);
    return {
      kind: 'responses',
      actions: result.inboxActions,
      receipt: (record.checkpoint as { sha256: string }).sha256,
    };
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
      authorityBase: this.context.base,
      base,
      bindings: this.context.bindings,
    });
    record.executionRunId = assignment.runId;
    record.assignmentId = assignment.id;
    record.environment = resolved.environment;
    record.resolvedAssignment = resolved;
    record.directionAccepted = true;
    record.trustedVerificationPaths = this.context.verificationInputs;
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

  /** Distinguishes accepted intent from verified delivery and preserves explicit milestone semantics. */
  private dependencyContext(assignment: ExecutionAssignment, record: RecordData): void {
    const dependencies = assignment.dependencies.map((id) => this.store.assignment(id));
    if (!dependencies.length) return;
    const delivered = dependencies.filter((dependency) => dependency.status === 'completed');
    record.coordinationContext =
      'Dependency assignment states (accepted intent is not verified delivery): ' +
      JSON.stringify(dependencies) +
      '\nRequired dependency milestones: ' +
      JSON.stringify(assignment.data.milestones ?? {}) +
      (delivered.length ? '\nVerified dependency deliveries: ' + JSON.stringify(delivered) : '') +
      '\nIf accepted intent is insufficient, explicitly request milestone=delivered with the existing assignmentId and matching owner, objective, acceptance criteria and scope. The host does not silently strengthen an accepted milestone.';
  }

  /** Incorporates verified deliveries without losing incomplete owner changes or frozen evidence. */
  private async refresh(assignment: ExecutionAssignment, record: RecordData): Promise<RecordData> {
    const current = String(
      this.store.run(assignment.runId).data.candidateRevision ?? this.context.base,
    );
    if (record.base === current) return record;
    const incoming = this.snapshots.capture(record.workspace, record.base);
    const merged = this.snapshots.reconcile(record.base, current, incoming);
    if (merged.status !== 'merged') throw new Error('Candidate conflict: ' + merged.evidence);
    const next = await this.materialize(assignment, record, current, merged.revision);
    record.previousWorkspaces = [
      ...((record.previousWorkspaces ?? []) as string[]),
      record.workspace,
    ];
    Object.assign(record, {
      workspace: next.workspace,
      branch: next.branch,
      base: current,
    });
    if (record.nextStage === 'finished') record.nextStage = 'review';
    record.reconciledCandidateDigest = candidateDigest(record);
    record.reconciliationId = next.id;
    save(this.root, record);
    this.store.updateAssignment(assignment.id, 'running', { reconciliation: null });
    return record;
  }

  /** Materializes a reconciled candidate while retaining the owner's edits relative to the new base. */
  private async materialize(
    assignment: ExecutionAssignment,
    record: RecordData,
    current: string,
    revision: string,
  ): Promise<RecordData> {
    const next = createWorkspace(this.root, {
      project: this.context.source,
      authorityBase: this.context.base,
      base: current,
      bindings: this.context.bindings,
    });
    next.environment = record.environment;
    this.store.updateAssignment(assignment.id, 'running', {
      reconciliation: { recordId: next.id, workspace: next.workspace, current, revision },
    });
    await prepareWorkspace(this.root, next, this.signal);
    this.snapshots.apply(next.workspace, current, revision);
    return next;
  }

  /** Converts precise boundary requests to durable identities; unknown owners remain blockers. */
  private requests(
    assignment: ExecutionAssignment,
    record: RecordData,
    requests: AgentResult['requests'],
  ): ActivationResult {
    if (requests.some((r) => !r.ownerId || !this.context.owners.includes(r.ownerId)))
      return { kind: 'blocked', reason: JSON.stringify(requests) };
    return {
      kind: 'request',
      requests: requests.map((r, index) => ({
        key: `${assignment.id}:${(record.checkpoint as { sha256: string }).sha256}:${index}`,
        owner: r.ownerId!,
        existingAssignmentId: r.assignmentId ?? undefined,
        kind: r.kind,
        changeType: r.changeType,
        allowedWritePaths: r.allowedWritePaths,
        milestone: r.milestone ?? 'delivered',
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
      false,
      new ExecutionEvidence(this.root, this.store).capture(assignment.runId),
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
