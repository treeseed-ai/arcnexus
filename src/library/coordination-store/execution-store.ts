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
    return this.assignments(runId).filter(
      (item) =>
        item.status === 'ready' &&
        item.dependencies.every((id) => this.assignment(id).status === 'completed'),
    );
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
    return this.db.transaction('requests.delivered', { from, requests }, () =>
      requests.map((request) => this.route(from, request)),
    );
  }

  /** Routes within the caller's transaction, preserving request identity and recipient intent. */
  private route(from: string, request: OwnerRequest): ExecutionAssignment {
    const existing = this.db
      .all<InboxRequest>('request')
      .find((item) => item.from === from && item.key === request.key);
    if (existing) return this.repeated(existing, request);
    const sender = this.assignment(from);
    const recipient = this.create(
      sender.runId,
      request.owner,
      request.objective,
      request.acceptance,
    );
    const proposal = sender.data.proposal as Record<string, unknown> | undefined;
    recipient.data.proposal = {
      kind: proposal?.kind ?? 'change',
      changeType: proposal?.changeType ?? 'behavior',
    };
    this.db.put('assignment', recipient);
    this.db.put('request', { ...request, id: randomUUID(), from, assignmentId: recipient.id });
    this.connect(sender, recipient);
    return recipient;
  }

  /** Rejects accidental mutation of an already delivered request. */
  private repeated(existing: InboxRequest, request: OwnerRequest): ExecutionAssignment {
    const { id: _id, from: _from, assignmentId, ...original } = existing;
    if (JSON.stringify(original) !== JSON.stringify(request))
      throw new Error('Request identity reused with different content');
    return this.assignment(assignmentId);
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
      throw new Error('Blocking dependency cycle');
    if (!sender.dependencies.includes(recipient.id)) sender.dependencies.push(recipient.id);
    sender.status = sender.dependencies.every((id) => this.assignment(id).status === 'completed')
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
      if (!evidence.length) throw new Error('Verified delivery requires evidence');
      if (assignment.dependencies.some((dep) => this.assignment(dep).status !== 'completed'))
        throw new Error('Undelivered dependencies');
      this.db.put('assignment', { ...assignment, status: 'completed', evidence });
      if (candidate) {
        const run = this.run(assignment.runId);
        this.db.put('run', {
          ...run,
          data: { ...run.data, ...candidate, promotedAt: new Date().toISOString() },
        });
      }
      for (const dependent of this.assignments(assignment.runId)) {
        if (dependent.status !== 'waiting') continue;
        if (dependent.dependencies.every((dep) => this.assignment(dep).status === 'completed'))
          this.db.put('assignment', { ...dependent, status: 'ready' });
      }
    });
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
        if (other.id !== id && this.reaches(other.id, id, new Set()))
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
