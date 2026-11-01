import { InboxDecisions, type InboxDecision } from './inbox-decisions.js';
import { randomUUID } from 'node:crypto';
import { ExecutionDatabase } from './execution-database.js';
import type {
  AssignmentStatus,
  ExecutionAssignment,
  ExecutionRun,
  InboxRequest,
  OwnerRequest,
  RunMode,
  RunStatus,
} from './execution-types.js';

export { ExecutionLease } from './execution-lease.js';

/** Persists assignment accountability, inbox identities and dependency readiness atomically. */
export class ExecutionStore {
  private readonly db: ExecutionDatabase;

  /** Opens a new or retained general execution store without reading legacy workdays. */
  constructor(path: string) {
    this.db = new ExecutionDatabase(path);
  }

  /** Captures the eligible owners and goal for one run. */
  createRun(mode: RunMode, owners: string[], objective: string): ExecutionRun {
    if (!owners.length || new Set(owners).size !== owners.length)
      throw new Error('Invalid eligible owners');
    const run: ExecutionRun = {
      id: randomUUID(),
      mode,
      owners,
      objective,
      status: 'running',
      createdAt: new Date().toISOString(),
      data: {},
    };
    return this.db.transaction('run.created', run, () => {
      this.db.put('run', run);
      return run;
    });
  }

  /** Returns the captured run, including its mutable lifecycle state. */
  run(id: string): ExecutionRun {
    return this.db.get('run', id);
  }

  /** Lists runs in submission order. */
  runs(): ExecutionRun[] {
    return this.db.all('run');
  }

  /** Persists lifecycle and policy state together. */
  updateRun(id: string, status: RunStatus, data: Record<string, unknown> = {}): void {
    this.db.transaction('run.updated', { id, status }, () => {
      const run = this.run(id);
      this.db.put('run', { ...run, status, data: { ...run.data, ...data } });
    });
  }

  /** Creates a distinct assignment even when its owner already has other work. */
  enqueue(
    runId: string,
    owner: string,
    objective: string,
    acceptance: string[] = [],
  ): ExecutionAssignment {
    return this.db.transaction('assignment.created', { runId, owner }, () =>
      this.create(runId, owner, objective, acceptance),
    );
  }

  /** Validates authority and constructs an assignment within the caller's transaction. */
  private create(
    runId: string,
    owner: string,
    objective: string,
    acceptance: string[],
  ): ExecutionAssignment {
    if (!this.run(runId).owners.includes(owner))
      throw new Error('Unknown eligible owner: ' + owner);
    if (!objective.trim()) throw new Error('Assignment objective is empty');
    const assignment: ExecutionAssignment = {
      id: randomUUID(),
      runId,
      owner,
      objective,
      acceptance,
      status: 'ready',
      dependencies: [],
      evidence: [],
      data: {},
    };
    this.db.put('assignment', assignment);
    return assignment;
  }

  /** Reads authoritative assignment state. */
  assignment(id: string): ExecutionAssignment {
    return this.db.get('assignment', id);
  }

  /** Lists all assignments belonging to a run in submission order. */
  assignments(runId: string): ExecutionAssignment[] {
    return this.db.all<ExecutionAssignment>('assignment').filter((item) => item.runId === runId);
  }

  /** Selects ready work whose dependencies have verified delivery. */
  ready(runId: string): ExecutionAssignment[] {
    return this.assignments(runId)
      .filter(
        (item) =>
          item.status === 'ready' &&
          ((Array.isArray(item.data.questions) && item.data.questions.length > 0) ||
            item.dependencies.every((id) => this.satisfied(item, id))),
      )
      .sort((a, b) => Number(a.data.readyOrder ?? 0) - Number(b.data.readyOrder ?? 0));
  }

  /** Captures continuation evidence without erasing earlier state. */
  updateAssignment(id: string, status: AssignmentStatus, data: Record<string, unknown> = {}): void {
    this.db.transaction('assignment.updated', { id, status }, () => {
      const item = this.assignment(id);
      this.db.put('assignment', { ...item, status, data: { ...item.data, ...data } });
    });
  }

  /** Routes a request once; conflicting reuse of a request identity is rejected. */
  request(from: string, request: OwnerRequest): ExecutionAssignment {
    return this.requests(from, [request])[0]!;
  }

  /** Delivers an entire fan-out atomically so invalid recipients cannot leave partial dispatch. */
  requests(from: string, requests: OwnerRequest[]): ExecutionAssignment[] {
    return this.db.transaction('requests.delivered', { from, requests }, () => {
      const recipients = requests.map((request) => this.route(from, request));
      this.wake(this.assignment(from).runId);
      return recipients;
    });
  }

  /** Commits replies and newly discovered dependencies as one recoverable activation outcome. */
  exchange(from: string, requests: OwnerRequest[], actions: InboxDecision[]): void {
    this.db.transaction('inbox.exchanged', { from, requests, actions }, () => {
      for (const action of actions) new InboxDecisions(this.db).apply(from, action);
      for (const request of requests) this.route(from, request);
      this.wake(this.assignment(from).runId);
    });
  }

  /** Routes within the caller's transaction, preserving request identity and recipient intent. */
  private route(from: string, request: OwnerRequest): ExecutionAssignment {
    const existing = this.db
      .all<InboxRequest>('request')
      .find((item) => item.from === from && item.key === request.key);
    if (existing) return this.repeated(existing, request);
    const sender = this.assignment(from);
    this.rejectRecursiveIntent(sender, request);
    const recipient = request.existingAssignmentId
      ? this.assignment(request.existingAssignmentId)
      : this.create(sender.runId, request.owner, request.objective, request.acceptance);
    if (
      recipient.owner !== request.owner ||
      recipient.objective !== request.objective ||
      JSON.stringify(recipient.acceptance) !== JSON.stringify(request.acceptance)
    )
      throw new Error('Shared assignment acceptance differs');
    sender.data.milestones = {
      ...((sender.data.milestones ?? {}) as object),
      [recipient.id]: request.milestone ?? 'delivered',
    };
    this.captureProposal(sender, recipient, request);
    this.db.put('assignment', recipient);
    this.db.put('request', { ...request, id: randomUUID(), from, assignmentId: recipient.id });
    this.connect(sender, recipient);
    return recipient;
  }

  /** Preserves explicit recipient workflow and rejects incompatible reuse of accepted shared work. */
  private captureProposal(
    sender: ExecutionAssignment,
    recipient: ExecutionAssignment,
    request: OwnerRequest,
  ): void {
    const inherited = sender.data.proposal as Record<string, unknown> | undefined;
    const proposed = {
      kind: request.kind ?? inherited?.kind ?? 'change',
      changeType: request.changeType ?? inherited?.changeType ?? 'behavior',
      ...(request.allowedWritePaths ? { allowedWritePaths: request.allowedWritePaths } : {}),
    };
    const existing = recipient.data.proposal as Record<string, unknown> | undefined;
    for (const key of ['kind', 'changeType', 'allowedWritePaths'] as const)
      if (
        existing &&
        request[key] != null &&
        JSON.stringify(existing[key]) !== JSON.stringify(proposed[key])
      )
        throw new Error('Shared assignment workflow or scope differs');
    recipient.data.proposal ??= proposed;
  }

  /** Rejects a repeated ancestor intent as a blocking cycle without merging unrelated same-owner work. */
  private rejectRecursiveIntent(sender: ExecutionAssignment, request: OwnerRequest): void {
    if (request.existingAssignmentId) return;
    const ancestor = this.assignments(sender.runId).find(
      (a) =>
        a.owner === request.owner &&
        a.objective === request.objective &&
        JSON.stringify(a.acceptance) === JSON.stringify(request.acceptance) &&
        this.reaches(a.id, sender.id, new Set()),
    );
    if (ancestor)
      throw Object.assign(
        new Error(
          `Blocking dependency cycle: repeated ancestor intent ${ancestor.id} -> ${sender.id}`,
        ),
        { name: 'DependencyBlocked' },
      );
  }

  /** Rejects accidental mutation of an already delivered request. */
  private repeated(existing: InboxRequest, request: OwnerRequest): ExecutionAssignment {
    const { id: _id, from: _from, assignmentId, ...original } = existing;
    if (JSON.stringify(original) !== JSON.stringify(request))
      throw new Error('Request identity reused with different content');
    return this.assignment(assignmentId);
  }

  /** Lists request envelopes addressed to or sent by this assignment. */
  inbox(id: string): Array<InboxRequest & { replies: Array<InboxDecision & { actor: string }> }> {
    const replies = this.db.all<InboxDecision & { actor: string }>('reply');
    return this.db
      .all<InboxRequest>('request')
      .filter((r) => r.from === id || r.assignmentId === id)
      .map((request) => ({
        ...request,
        replies: replies.filter((reply) => reply.requestId === request.id),
      }));
  }

  /** Records an accepted host-validated plan and releases accepted-intent dependents. */
  accept(id: string): void {
    this.db.transaction('assignment.accepted', { id }, () => {
      const item = this.assignment(id);
      item.data.accepted = true;
      this.db.put('assignment', item);
      this.wake(item.runId);
    });
  }

  /** Commits correlated decisions and dependent readiness together. */
  respond(id: string, decisions: InboxDecision[]): void {
    this.db.transaction('inbox.responses', { id, decisions }, () => {
      for (const decision of decisions) new InboxDecisions(this.db).apply(id, decision);
      const actor = this.assignment(id);
      if (actor.status === 'running') this.db.put('assignment', { ...actor, status: 'ready' });
      this.wake(actor.runId);
    });
  }

  /** Distinguishes accepted intent from verified delivery for each dependency edge. */
  private satisfied(item: ExecutionAssignment, id: string): boolean {
    const required = (item.data.milestones as Record<string, string> | undefined)?.[id];
    const dependency = this.assignment(id);
    return (
      dependency.status === 'completed' ||
      (required === 'accepted' && dependency.data.accepted === true)
    );
  }

  /** Wakes satisfied waiters and propagates rejected deliveries without disturbing unrelated work. */
  private wake(runId: string): void {
    const assignments = this.assignments(runId);
    for (const item of assignments) {
      if (!['waiting', 'ready'].includes(item.status)) continue;
      const failed = assignments.find(
        (dep) =>
          ['blocked', 'rejected', 'failed'].includes(dep.status) &&
          this.reaches(item.id, dep.id, new Set()),
      );
      if (failed)
        this.db.put('assignment', {
          ...item,
          status: 'blocked',
          data: {
            ...item.data,
            reason: `Dependency ${failed.id}: ${failed.data.reason ?? failed.status}`,
          },
        });
      else if (
        !item.data.clarification &&
        item.dependencies.every((id) => this.satisfied(item, id))
      )
        this.db.put('assignment', { ...item, status: 'ready' });
    }
  }

  /** Adds an explicit dependency on shared work, rejecting cross-run links and cycles. */
  link(from: string, to: string): void {
    this.db.transaction('dependency.linked', { from, to }, () =>
      this.connect(this.assignment(from), this.assignment(to)),
    );
  }

  /** Validates a wait edge before persisting readiness changes. */
  private connect(sender: ExecutionAssignment, recipient: ExecutionAssignment): void {
    if (sender.runId !== recipient.runId)
      throw new Error('Cross-run dependency requires a new assignment');
    if (this.reaches(recipient.id, sender.id, new Set()))
      throw Object.assign(new Error('Blocking dependency cycle'), { name: 'DependencyBlocked' });
    if (!sender.dependencies.includes(recipient.id)) sender.dependencies.push(recipient.id);
    sender.status = sender.dependencies.every((id) => this.satisfied(sender, id))
      ? 'ready'
      : 'waiting';
    this.db.put('assignment', sender);
  }

  /** Searches the existing wait graph without assuming a fixed number of owners. */
  private reaches(id: string, target: string, seen: Set<string>): boolean {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return this.assignment(id).dependencies.some((next) => this.reaches(next, target, seen));
  }

  /** Marks verified delivery and wakes all satisfied dependents in the same transaction. */
  complete(id: string, evidence: string[], candidate?: Record<string, unknown>): void {
    this.db.transaction('assignment.delivered', { id, evidence }, () => {
      const assignment = this.assignment(id);
      if (assignment.status === 'completed') {
        if (
          JSON.stringify(assignment.evidence) !== JSON.stringify(evidence) ||
          assignment.data.deliveredRevision !== candidate?.candidateRevision
        )
          throw new Error('Duplicate delivery disagrees with retained verification');
        return;
      }
      if (!evidence.length) throw new Error('Verified delivery requires evidence');
      if (assignment.dependencies.some((dep) => !this.satisfied(assignment, dep)))
        throw new Error('Undelivered dependencies');
      this.db.put('assignment', {
        ...assignment,
        status: 'completed',
        evidence,
        data: { ...assignment.data, deliveredRevision: candidate?.candidateRevision },
      });
      if (candidate) this.promote(assignment.runId, candidate);
      this.wake(assignment.runId);
    });
  }

  /** Advances the project candidate in the same transaction as its verified assignment delivery. */
  private promote(runId: string, candidate: Record<string, unknown>): void {
    const run = this.run(runId);
    this.db.put('candidate', {
      id: JSON.stringify([run.data.authorityBase, run.data.packageId]),
      runId,
    });
    this.db.put('run', {
      ...run,
      data: { ...run.data, ...candidate, promotedAt: new Date().toISOString() },
    });
  }

  /** Reads the transactional candidate pointer rather than inferring promotion order from wall-clock timestamps. */
  latestDelivery(authorityBase: string, packageId: string): ExecutionRun | undefined {
    const id = JSON.stringify([authorityBase, packageId]);
    const pointer = this.db
      .all<{ id: string; runId: string }>('candidate')
      .find((p) => p.id === id);
    return pointer ? this.run(pointer.runId) : undefined;
  }

  /** Blocks dependents transitively while leaving unrelated work runnable. */
  fail(
    id: string,
    status: 'blocked' | 'rejected' | 'failed' | 'interrupted',
    reason: string,
  ): void {
    this.db.transaction('assignment.failed', { id, status, reason }, () => {
      const item = this.assignment(id);
      this.db.put('assignment', { ...item, status, data: { ...item.data, reason } });
      for (const other of this.assignments(item.runId)) {
        if (
          other.id !== id &&
          other.status !== 'completed' &&
          this.reaches(other.id, id, new Set())
        )
          this.db.put('assignment', {
            ...other,
            status: 'blocked',
            data: { ...other.data, reason },
          });
      }
    });
  }

  /** Exposes immutable event projections for reports and streaming clients. */
  events(after = 0) {
    return this.db.events(after);
  }

  /** Releases resources owned by this connection. */
  close(): void {
    this.db.close();
  }
}
