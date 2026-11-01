import { initializeExecution, type InitializationEvidence } from '../task-intake/initializer.js';
import { milliseconds, minimumLimit } from '../architecture/config.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, materializeChecks, type ResolvedAssignment } from '../architecture/assignment.js';
import { covered } from '../architecture/components.js';
import { InputError } from '../architecture/config.js';
import { StewardSession, type SessionControl } from '../assignment/steward.js';
import { captureChanges } from '../change-inspection/changes.js';
import { WorkdayStore } from '../coordination-store/workday-store.js';
import { prepareCapabilities } from '../operations/probes.js';
import { assertServicesStopped, processStart } from '../operations/service-state.js';
import { saveMarkdown } from '../report/report.js';
import { observeExecution } from '../report/timeline.js';
import { workdayMarkdown, workdayMetrics } from '../report/workday-report.js';
import { save, type RecordData } from '../workspace/state.js';
import { createWorkspace, prepareWorkspace } from '../workspace/workspace.js';
import { ActiveBudget } from './workday-budget.js';
import type { WorkdayInput, WorkdayParticipant } from './workday-config.js';
import { WorktreeParking, assertOwner, snapshotChanges } from './workday-parking.js';
import { WorkdayRouting } from './workday-routing.js';
import { Owner, WorkdayContext, blocked } from './workday-state.js';

/** Owns the workday lifecycle; routing and engineering retain separate responsibilities. */
export class WorkdayRunner {
  private readonly state: WorkdayContext;
  private readonly routing: WorkdayRouting;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(root: string, parentSignal: AbortSignal, executable: string) {
    this.state = new WorkdayContext(root, parentSignal, executable);
    this.routing = new WorkdayRouting(this.state);
  }

  async run(input: WorkdayInput, issue?: string, initialization?: InitializationEvidence) {
    this.validate(input);
    this.state.input = input;
    const timeout = new AbortController();
    const timer =
      input.timeoutSeconds === undefined
        ? undefined
        : setTimeout(
            () => timeout.abort(new Error('Workday deadline exhausted')),
            milliseconds(input.timeoutSeconds),
          );
    this.state.signal = AbortSignal.any([this.state.parentSignal, timeout.signal]);
    try {
      await this.initialize(issue);
      for (const participant of [input.requester, input.recipient]) this.createOwner(participant);
      this.captureAssignments();
      await this.baselines();
      await this.initializeOwners(initialization);
      await this.execute();
      await this.verifyOwners();
      await this.combinedAcceptance();
      this.state.status = 'completed';
    } catch (error) {
      this.failure(error);
    } finally {
      clearTimeout(timer);
      this.finalize();
    }
    return this.report();
  }

  private validate(input: WorkdayInput): void {
    const { digest: hash, ...captured } = input;
    if (
      [input.requester, input.recipient].some((p) => p.resolved.executionProfile.schemaVersion < 2)
    )
      throw new InputError('Workday execution requires planned version-2 profiles');
    if (digest(JSON.stringify(captured)) !== hash) throw new InputError('Captured workday changed');
  }

  private async initialize(issue?: string): Promise<void> {
    const state = this.state,
      input = state.input;
    state.workspace = createWorkspace(state.root, {
      project: input.source,
      base: input.base,
      issue,
      bindings: input.requester.resolved.bindings,
    });
    this.preparationPolicy();
    state.directory = join(state.root, 'workdays', state.workspace.id);
    mkdirSync(state.directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(state.directory, 'input.json'), JSON.stringify(input, null, 2) + '\n', {
      mode: 0o600,
      flush: true,
    });
    this.initializeStore();
    state.parking = new WorktreeParking(state.workspace, join(state.directory, 'parking.json'));
    state.workspace.workday = {
      id: state.workspace.id,
      assignments: [],
      parking: state.parking.path,
      active: true,
    };
    save(state.root, state.workspace);
    await prepareWorkspace(state.root, state.workspace, state.signal);
  }

  private preparationPolicy(): void {
    const state = this.state,
      input = state.input;
    state.workspace.preparationCommandTimeoutSeconds = minimumLimit(
      input.requester.resolved.executionProfile.commandTimeoutSeconds,
      input.recipient.resolved.executionProfile.commandTimeoutSeconds,
    );
    state.workspace.evidenceMode = process.env.ARCNEXUS_EXPERIMENT_MODE ?? 'live';
  }

  private initializeStore(): void {
    const state = this.state;
    state.store = new WorkdayStore(join(state.directory, 'workday.sqlite'), true);
    state.store.initialize(
      state.workspace.id,
      {
        inputHash: state.input.digest,
        host: { pid: process.pid, start: processStart(process.pid) },
      },
      [state.input.requester.resolved.componentId, state.input.recipient.resolved.componentId],
    );
  }

  private createRecord(participant: WorkdayParticipant): RecordData {
    const record: RecordData = {
      ...this.state.workspace,
      id: randomUUID(),
      status: 'prepared',
      commands: [],
      startedAt: new Date().toISOString(),
      resolvedAssignment: participant.resolved,
      context: participant.resolved.context,
      objective: participant.resolved.assignment.objective,
      workdayId: this.state.workspace.id,
    };
    delete record.timelineSequence;
    delete record.workday;
    mkdirSync(join(this.state.root, 'runs', record.id), { mode: 0o700 });
    return record;
  }

  private createOwner(participant: WorkdayParticipant): void {
    const state = this.state,
      record = this.createRecord(participant);
    const budget = new ActiveBudget(
      state.signal,
      milliseconds(participant.resolved.executionProfile.timeoutSeconds),
    );
    const owner = new Owner(participant, record, budget);
    const control = this.control(owner);
    owner.session = new StewardSession(
      state.root,
      record,
      participant.resolved.componentId,
      participant.resolved.assignment.objective,
      participant.resolved.executionProfile.model,
      state.executable,
      budget.signal,
      participant.maxAttempts,
      control,
    );
    state.owners.push(owner);
    control.context = state.context(owner);
    this.observe(owner);
  }

  private control(owner: Owner): SessionControl {
    return {
      prepared: true,
      initialized: true,
      context: '',
      inspect: () =>
        assertOwner(owner.record, owner.participant.resolved.allowedWritePaths, owner.foreign),
      elapsedMs: () => owner.budget.elapsedMs,
      actions: (activity) => this.actions(owner, activity),
      chargeTurn: (kind) => this.chargeTurn(owner, kind),
      onResult: (session, activity, result) =>
        this.routing.onResult(owner, session, activity, result),
    };
  }

  private actions(owner: Owner, activity: string): string[] {
    if (owner === this.state.owners[0])
      return activity === 'coordination' ? ['answer'] : this.state.requestId ? [] : ['request'];
    return activity === 'planning' && !this.state.accepted ? ['accept', 'reject', 'clarify'] : [];
  }

  private chargeTurn(owner: Owner, kind: 'coordination' | 'engineering'): void {
    if (kind === 'coordination') {
      this.state.coordinationTurns++;
      const limit = this.state.input.maxCoordinationTurns;
      if (limit !== undefined && this.state.coordinationTurns > limit)
        throw new Error('Coordination turn budget exhausted');
      return;
    }
    owner.engineering++;
    const profile = owner.participant.resolved.executionProfile;
    const limit =
      profile.maxTurns === undefined
        ? undefined
        : profile.maxTurns +
          (owner.participant.maxAttempts === 1 ? 0 : (profile.maxCorrectiveTurns ?? 0));
    if (limit !== undefined && owner.engineering > limit)
      throw new Error('Engineering turn budget exhausted');
  }

  private observe(owner: Owner): void {
    const { root, store } = this.state,
      { record, participant } = owner;
    this.unsubscribe.push(
      observeExecution(root, record.id, (event) =>
        store.commit('execution.' + event.type, {
          owner: participant.resolved.componentId,
          runId: record.id,
          sequence: event.sequence,
          turn: event.turn,
          artifact: join(root, 'runs', record.id, 'timeline.jsonl'),
        }),
      ),
    );
  }

  private captureAssignments(): void {
    const state = this.state;
    state.persist(
      'assignments.captured',
      { authority: state.input.digest },
      state.owners.map((owner) =>
        state.message(owner, owner, 'assignment', {
          issuer: 'host',
          authorityHash: owner.participant.resolved.digest,
          assignment: owner.participant.resolved.assignment,
        }),
      ),
    );
    state.workspace.workday = {
      id: state.workspace.id,
      assignments: state.owners.map((o) => o.record.id),
      parking: state.parking.path,
      active: true,
    };
    save(state.root, state.workspace);
  }

  private async baselines(): Promise<void> {
    for (const owner of this.state.owners) {
      this.state.activate(owner);
      await prepareCapabilities(this.state.root, owner.record, owner.budget.signal);
      for (const command of owner.participant.resolved.verification)
        await this.state.command(owner, command, 'baseline');
      owner.budget.pause();
    }
  }

  private async initializeOwners(initialization?: InitializationEvidence): Promise<void> {
    const state = this.state;
    if (initialization) {
      if (
        initialization.authorityHash !== state.input.digest ||
        initialization.result?.status !== 'ready'
      )
        throw new InputError('Accepted initialization does not match workday authority');
      state.workspace.initialization = initialization;
    } else
      await initializeExecution({
        root: state.root,
        record: state.workspace,
        resolved: state.input.requester.resolved,
        owners: state.owners.map((owner) => owner.participant.resolved.componentId),
        executable: state.executable,
        signal: state.signal,
        envelope: state.input,
      });
    for (const owner of state.owners) owner.record.initialization = state.workspace.initialization;
    state.persist('initialization.completed', { evidence: state.workspace.initialization });
  }

  private async execute(): Promise<void> {
    const state = this.state,
      requester = state.owners[0]!;
    state.status = 'running';
    state.activate(requester);
    await requester.session.run();
    requester.budget.pause();
    state.sync(requester);
    if (
      !state.requestId ||
      !state.accepted ||
      state.owners.some((o) => o.record.status !== 'completed')
    )
      throw blocked('Workday did not complete the authorized dependency');
  }

  private async verifyOwners(): Promise<void> {
    for (const owner of this.state.owners) {
      owner.foreign = snapshotChanges(this.state.workspace).filter(
        (e) =>
          !owner.participant.resolved.allowedWritePaths.some(
            (p) => p === '.' || e.path === p || e.path.startsWith(p + '/'),
          ),
      );
      this.state.activate(owner);
      await this.state.refresh(owner);
      await owner.session.verifyFinal();
      owner.session.captureCheckpoint();
      this.state.sync(owner);
      owner.budget.pause();
    }
  }

  private async combinedAcceptance(): Promise<void> {
    const state = this.state,
      input = state.input,
      requester = state.owners[0]!;
    const checks = materializeChecks(
      {
        ...input.requester.resolved,
        artifacts: input.artifacts,
        assignment: {
          ...input.requester.resolved.assignment,
          hostChecks: input.acceptance,
        },
      } as ResolvedAssignment,
      join(state.directory, 'acceptance'),
    );
    state.activate(requester);
    for (const command of checks) await state.command(requester, command, 'combined-acceptance');
    requester.budget.pause();
  }

  private failure(error: unknown): void {
    this.state.error = String(error);
    this.state.status =
      error instanceof Error && error.name === 'NeedsAttention'
        ? 'needs_attention'
        : this.state.parentSignal.aborted
          ? 'cancelled'
          : (error instanceof Error && error.name === 'WorkdayBlocked') ||
              this.state.workspace?.status === 'blocked' ||
              this.state.owners.some((o) => o.record.status === 'blocked')
            ? 'blocked'
            : /budget|deadline/i.test(String(error))
              ? 'budget_exhausted'
              : 'failed';
  }

  private finalize(): void {
    const state = this.state;
    for (const owner of state.owners) owner.budget.pause();
    this.restoreParking();
    for (const owner of state.owners) this.finalizeOwner(owner);
    state.activeOwner = null;
    if (state.store && state.parking) {
      state.persist('workday.finished', {
        status: state.status,
        error: state.error,
      });
      for (const stop of this.unsubscribe) stop();
    }
    if (state.workspace) this.finalizeWorkspace();
  }

  private restoreParking(): void {
    if (this.state.parking?.status !== 'parked') return;
    try {
      this.state.parking.restore();
    } catch (error) {
      this.state.error = (this.state.error ?? '') + '; restoration: ' + String(error);
      this.state.status = 'failed';
    }
  }

  private finalizeOwner(owner: Owner): void {
    const state = this.state;
    try {
      assertServicesStopped(state.root, owner.record.id);
      captureChanges(state.root, owner.record);
      owner.record.finishedAt = new Date().toISOString();
      owner.record.activeMs = owner.budget.elapsedMs;
      owner.record.ownedChanges = (
        owner.record.changes as Array<{ path: string; kind: string }>
      ).filter((c) => covered(c.path, owner.participant.resolved.allowedWritePaths));
      save(state.root, owner.record);
      saveMarkdown(state.root, owner.record);
    } catch (error) {
      state.error = (state.error ?? '') + '; evidence: ' + String(error);
      state.status = 'failed';
    }
  }

  private finalizeWorkspace(): void {
    const { workspace, root, status, error } = this.state;
    if (workspace.workday) (workspace.workday as { active: boolean }).active = false;
    workspace.status = status;
    workspace.finishedAt = new Date().toISOString();
    workspace.error = error;
    captureChanges(root, workspace);
    save(root, workspace);
    saveMarkdown(root, workspace);
  }

  private report() {
    if (!this.state.store) throw new InputError(this.state.error ?? 'Workday preparation failed');
    try {
      const report = this.projection();
      Object.assign(report, { metrics: workdayMetrics(report) });
      const path = join(this.state.directory, 'report.json');
      writeFileSync(path + '.tmp', JSON.stringify(report, null, 2) + '\n', {
        mode: 0o600,
      });
      renameSync(path + '.tmp', path);
      writeFileSync(join(this.state.directory, 'report.md'), workdayMarkdown(report), {
        mode: 0o600,
      });
      return report;
    } finally {
      this.state.store.close();
    }
  }

  private projection() {
    const state = this.state,
      snapshot = state.store.snapshot();
    return {
      schemaVersion: 1,
      initialization: state.workspace.initialization,
      ...state.state(),
      exitCode: this.exitCode(),
      assignments: snapshot.assignments.map((a) => a.data as RecordData),
      messages: snapshot.messages.map((m) => ({
        id: m.id,
        from: m.sender,
        to: m.recipient,
        kind: m.kind,
        replyTo: m.reply_to,
        payload: m.data,
      })),
      events: state.store.events(),
    };
  }

  private exitCode(): number {
    if (this.state.status === 'completed') return 0;
    if (this.state.status === 'cancelled') return 130;
    return this.state.status === 'failed' &&
      !this.state.owners.some((o) => Array.isArray(o.record.turns) && o.record.turns.length)
      ? 2
      : 1;
  }
}
