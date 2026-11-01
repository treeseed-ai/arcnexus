import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { targetCommand } from '../architecture/bindings.js';
import { milliseconds, type Command } from '../architecture/config.js';
import { candidateDigest } from '../assignment/checkpoints.js';
import { StewardSession } from '../assignment/steward.js';
import { WorkdayStore, type Message } from '../coordination-store/workday-store.js';
import { operationEnvironment } from '../operations/operations.js';
import { execute } from '../operations/process.js';
import { processStart } from '../operations/service-state.js';
import { save, type RecordData } from '../workspace/state.js';
import { assertGeneratedOutputs, assertIdentity } from '../workspace/workspace.js';
import { ActiveBudget } from './workday-budget.js';
import type { WorkdayInput, WorkdayParticipant } from './workday-config.js';
import { WorktreeParking, snapshotChanges } from './workday-parking.js';

/** Retains one participant’s authority, thread, checkpoint and cumulative execution counters. */
export class Owner {
  session!: StewardSession;

  foreign: ReturnType<typeof snapshotChanges> = [];

  engineering = 0;

  lastCheckpoint?: string;

  /** Binds a participant to its retained execution record and cumulative active-time accounting. */
  constructor(
    public participant: WorkdayParticipant,
    public record: RecordData,
    public budget: ActiveBudget,
  ) {}
}

export function blocked(message: string): Error {
  const error = new Error(message);
  error.name = 'WorkdayBlocked';
  return error;
}

/** Shares captured participants and durable coordination dependencies across workday helpers. */
export class WorkdayContext {
  store!: WorkdayStore;

  workspace!: RecordData;

  input!: WorkdayInput;

  owners: Owner[] = [];

  parking!: WorktreeParking;

  routingMs = 0;

  status = 'preparing';

  error: string | undefined;

  activeOwner: string | null = null;

  coordinationTurns = 0;

  clarificationRounds = 0;

  requestId: string | undefined;

  accepted = false;

  started = Date.now();

  signal!: AbortSignal;

  directory!: string;

  /** Retains shared workday dependencies without dispatching either steward. */
  constructor(
    public root: string,
    public parentSignal: AbortSignal,
    public executable: string,
  ) {}

  /** Returns the current participant checkpoint and execution state. */
  state() {
    return {
      host: { pid: process.pid, start: processStart(process.pid) },
      workspaceId: this.workspace.id,
      workspace: this.workspace.workspace,
      base: this.input.base,
      status: this.status,
      error: this.error,
      activeOwner: this.activeOwner,
      elapsedMs: Date.now() - this.started,
      coordinationTurns: this.coordinationTurns,
      clarificationRounds: this.clarificationRounds,
      routingMs: this.routingMs,
      parking: { status: this.parking.status, path: this.parking.path },
      budgets: {
        workdaySeconds: this.input.timeoutSeconds ?? null,
        coordinationTurns: this.input.maxCoordinationTurns ?? null,
        assignmentSeconds: this.owners.map(
          (owner) => owner.participant.resolved.executionProfile.timeoutSeconds ?? null,
        ),
      },
      inputHash: this.input.digest,
      evidenceMode: this.workspace.evidenceMode,
    };
  }

  /** Durably records participant progress before another activation. */
  persist(type: string, payload: unknown, messages: Message[] = []) {
    const start = Date.now();
    this.store.commit(type, payload, {
      workday: {
        id: this.workspace.id,
        status: this.status,
        data: this.state(),
      },
      assignments: this.owners.map((o) => ({
        id: o.participant.resolved.componentId,
        status: o.record.status,
        data: { ...o.record, activeMs: o.budget.elapsedMs },
      })),
      messages,
    });
    if (/^(request|response|candidate|assignment.resumed)/.test(type))
      this.routingMs += Date.now() - start;
  }

  /** Refreshes the participant record from its retained session state. */
  sync(owner: Owner) {
    const checkpoint = owner.record.checkpoint as { path: string; sha256: string } | undefined;
    if (checkpoint) {
      if (digest(readFileSync(checkpoint.path)) !== checkpoint.sha256)
        throw new Error('Checkpoint artifact changed');
      if (owner.lastCheckpoint !== checkpoint.sha256) {
        this.store.commit(
          'checkpoint.captured',
          { owner: owner.participant.resolved.componentId, checkpoint },
          {
            execution: {
              assignment: owner.participant.resolved.componentId,
              data: {
                checkpoint,
                threadId: owner.record.threadId,
                turn: owner.record.turns,
              },
            },
          },
        );
        owner.lastCheckpoint = checkpoint.sha256;
      }
    }
    this.persist('assignment.checkpoint', {
      owner: owner.participant.resolved.componentId,
    });
  }

  /** Resumes this owner with its original authority and remaining counters. */
  activate(owner: Owner) {
    this.activeOwner = owner.participant.resolved.componentId;
    owner.budget.start();
    this.persist('assignment.activated', { owner: this.activeOwner });
  }

  /** Runs a captured owner command and retains timing and result evidence. */
  async command(owner: Owner, c: Command, stage: string) {
    owner.budget.signal.throwIfAborted();
    const before = candidateDigest(owner.record),
      log = join(this.root, 'runs', owner.record.id, `command-${owner.record.commands.length}.log`);
    let result;
    try {
      result = await this.executeCheck(owner, c, log);
      owner.record.commands.push({ ...result, stage });
    } catch (error) {
      if (error && typeof error === 'object' && 'commandResult' in error)
        owner.record.commands.push({
          ...(error.commandResult as RecordData['commands'][number]),
          stage,
        });
      throw error;
    } finally {
      save(this.root, owner.record);
      this.persist('host.check', {
        owner: owner.participant.resolved.componentId,
        stage,
        result: owner.record.commands.at(-1),
      });
    }
    if (candidateDigest(owner.record) !== before)
      throw new Error(stage + ' changed candidate source/index');
    assertIdentity(owner.record);
    assertGeneratedOutputs(owner.record.workspace, owner.record.environment);
  }

  /** Runs the captured verification command under owner execution accounting. */
  private async executeCheck(owner: Owner, c: Command, log: string) {
    return execute(
      targetCommand(owner.record, c),
      owner.record.workspace,
      log,
      owner.budget.signal,
      {
        timeoutMs: milliseconds(owner.participant.resolved.executionProfile.commandTimeoutSeconds),
        env: operationEnvironment(owner.record),
      },
    );
  }

  /** Rebuilds declared generated artifacts when switching candidate views. */
  async refresh(owner: Owner) {
    for (const c of owner.participant.refresh) await this.command(owner, c, 'handoff-refresh');
  }

  /** Appends an immutable correlated message through the coordination store. */
  message(
    from: Owner,
    to: Owner,
    kind: Message['kind'],
    payload: unknown,
    replyTo?: string,
  ): Message {
    return {
      id: randomUUID(),
      from: from.participant.resolved.componentId,
      to: to.participant.resolved.componentId,
      kind,
      payload,
      replyTo,
    };
  }

  /** Constructs the relevant delivery and dependency context for continuation. */
  context(owner: Owner): string {
    return `Workday participant: ${owner.participant.resolved.componentId}. Exactly two captured owners; no delegation. Contract: ${this.input.dependency.contract}. Required delivery: ${this.input.dependency.delivery}. ${owner === this.owners[0] ? 'If the captured objective needs the recipient, return status=blocked, one precise requests entry, and coordination action=request, requestId=null.' : 'During planning decide accept, reject, or one precise clarification. Acceptance must include a valid plan and activityComplete=true; it is not delivery.'} Coordination includes action, contract, requestId, text and activityComplete. Copy the captured contract value exactly, without paraphrasing; it is an authority identifier. Set coordination=null on ordinary turns. A partial activity sets activityComplete=false and will continue after verified delivery. Do not invent messages or acceptance checks. No new owner or contract may be selected.`;
  }
}
