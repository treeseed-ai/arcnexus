import { ExecutionReports } from '../report/report.js';
import { StewardshipPolicy } from '../workday/workday.js';
import { git } from '../operations/process.js';
import { InputError } from '../architecture/config.js';
import { validateContinuation } from '../assignment/steward.js';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectExecution } from '../architecture/execution-context.js';
import type { ActivationResult, ExecutionRun } from '../coordination-store/execution-types.js';
import { ExecutionStore } from '../coordination-store/execution-store.js';
import { RunWorkspace } from './run-workspace.js';
import type { RecordData } from '../workspace/state.js';
import { Direction, VerificationIssue } from '../task-intake/direction.js';
import { ProgressObserver } from '../report/progress.js';
import type { InitializationResult } from '../architecture/initialization.js';
import { AssignmentExecution } from './assignment-execution.js';
import { Scheduler } from './scheduler.js';

/** Owns sequential project execution while task and workday policies select different work. */
export class ProjectHost {
  readonly store: ExecutionStore;

  readonly reports: ExecutionReports;

  private readonly workspaces: RunWorkspace;

  private busy = false;

  private active?: { runId: string; controller: AbortController };

  /** Opens durable project state without automatically replaying interrupted activations. */
  constructor(
    readonly root: string,
    readonly context: ProjectExecution,
  ) {
    mkdirSync(join(root, 'runs'), { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'workspaces'), { recursive: true, mode: 0o700 });
    this.store = new ExecutionStore(join(root, 'projects', context.key, 'execution.sqlite'));
    this.reports = new ExecutionReports(join(root, 'projects', context.key), this.store);
    this.workspaces = new RunWorkspace(root, context, this.store);
    this.recover();
  }

  /** Applies user lifecycle intent immediately; active work reaches a checkpoint before pause. */
  control(action: string): unknown {
    let workday = this.workday();
    if (action === 'status') return this.status();
    if (action === 'start' && (!workday || workday.status === 'stopped'))
      workday = this.create('workday', 'Self-directed stewardship');
    if (!workday) throw new Error('No workday exists');
    if (workday.status === 'stopped' && ['pause', 'stop'].includes(action)) return this.status();
    if (action === 'pause' && workday.status !== 'stopped')
      this.store.updateRun(workday.id, this.active?.runId === workday.id ? 'pausing' : 'paused', {
        pauseReason: 'user',
      });
    else if (action === 'resume') this.resume(workday);
    else if (action === 'stop') {
      this.store.updateRun(workday.id, this.active?.runId === workday.id ? 'stopping' : 'stopped');
      if (this.active?.runId === workday.id) this.active.controller.abort(new Error('Cancelled'));
    } else if (!['start', 'status'].includes(action)) throw new Error('Unknown workday action');
    return this.status();
  }

  /** Queues a goal without interrupting an in-flight safe checkpoint. */
  submit(prompt: string): ExecutionRun {
    if (!prompt.trim()) throw new InputError('Task prompt must not be empty');
    const task = this.create('task', prompt);
    const workday = this.workday();
    if (workday && ['running', 'idle'].includes(workday.status))
      this.store.updateRun(workday.id, this.active?.runId === workday.id ? 'pausing' : 'paused', {
        pauseReason: 'task',
      });
    return task;
  }

  /** Retains a clarification response and schedules the director on the same task. */
  answer(id: string, answer: string): void {
    const run = this.store.run(id);
    if (run.mode !== 'task' || run.status !== 'needs_input')
      throw new Error('Task is not awaiting input');
    this.store.updateRun(id, 'running', {
      prompt: String(run.data.prompt ?? run.objective) + '\nArchitect response: ' + answer,
      initialized: false,
    });
  }

  /** Cancels only the identified task and preserves its candidate and logs. */
  cancel(id: string): void {
    const run = this.store.run(id);
    if (run.mode !== 'task') throw new Error('Expected task identity');
    this.store.updateRun(id, 'cancelled');
    if (this.active?.runId === id) this.active.controller.abort(new Error('Cancelled'));
  }

  /** Executes at most one activation so IPC controls remain responsive between checkpoints. */
  async tick(): Promise<void> {
    if (this.busy) return;
    const run = this.select();
    if (!run) return;
    this.busy = true;
    this.active = { runId: run.id, controller: new AbortController() };
    try {
      await this.advance(run, this.active.controller.signal);
    } catch (error) {
      this.failure(run.id, error);
    } finally {
      this.settle(run.id);
      this.reports.save(run.id);
      this.active = undefined;
      this.busy = false;
    }
  }

  /** Quarantines integrity failures across mode handoffs while retaining ordinary task failure isolation. */
  private failure(id: string, error: unknown): void {
    const current = this.store.run(id);
    if (!['cancelled', 'stopping', 'stopped'].includes(current.status))
      this.store.updateRun(id, 'needs_attention', { error: String(error) });
    if (!(error instanceof Error) || error.name !== 'CandidateIntegrityError') return;
    this.store.updateRun(id, this.store.run(id).status, { integrityError: String(error) });
    const workday = this.workday();
    if (workday && workday.status !== 'stopped')
      this.store.updateRun(workday.id, 'needs_attention', { integrityError: String(error) });
  }

  /** Projects current lifecycle and accountable assignments for the option-free status command. */
  status() {
    const workday = this.workday();
    const sourceRevision = git(this.context.source, 'rev-parse', 'HEAD').trim();
    return {
      sourceChanged: sourceRevision !== this.context.base,
      capturedRevision: this.context.base,
      sourceRevision,
      workday: workday ? this.reports.view(workday.id).run : undefined,
      active: this.active?.runId ?? null,
      tasks: this.store
        .runs()
        .filter((r) => r.mode === 'task')
        .map((r) => this.reports.view(r.id).run),
      assignments: workday ? this.reports.view(workday.id).assignments : [],
      candidate: this.latestCandidate(),
    };
  }

  /** Captures a new run against the last compatible verified candidate. */
  private create(mode: 'task' | 'workday', objective: string): ExecutionRun {
    if (git(this.context.source, 'status', '--porcelain', '--untracked-files=all').trim())
      throw new InputError('Source checkout must be clean when creating a new run');
    if (git(this.context.source, 'rev-parse', 'HEAD').trim() !== this.context.base)
      throw new InputError('Source revision changed; stop and start against updated authority');
    const run = this.store.createRun(mode, this.context.owners, objective);
    this.store.updateRun(run.id, 'running', {
      candidateRevision: this.latestCandidate(),
      authorityBase: this.context.base,
      packageId: this.context.packageId,
    });
    return this.store.run(run.id);
  }

  /** Selects queued tasks first and tracks automatic pauses independently of user intent. */
  private select(): ExecutionRun | undefined {
    const task = this.selectTask();
    const workday = this.workday();
    if (task) {
      if (workday && ['running', 'idle'].includes(workday.status))
        this.store.updateRun(workday.id, 'paused', { pauseReason: 'task' });
      return task;
    }
    if (workday?.status === 'paused' && workday.data.pauseReason === 'task')
      this.store.updateRun(workday.id, 'running', {
        candidateRevision: this.latestCandidate(),
        candidateRecord:
          this.latestDelivery()?.data.candidateRecord ?? workday.data.candidateRecord,
        pauseReason: null,
      });
    const latest = this.workday();
    return latest?.status === 'running' ? latest : undefined;
  }

  /** Keeps a task's project ownership across activations; answered clarifications rejoin the FIFO queue. */
  private selectTask(): ExecutionRun | undefined {
    const tasks = this.store.runs().filter((r) => r.mode === 'task' && r.status === 'running');
    const task = tasks.find((r) => r.data.executionOwner === true) ?? tasks[0];
    if (task && task.data.executionOwner !== true)
      this.store.updateRun(task.id, 'running', { executionOwner: true });
    return task;
  }

  /** Prepares context, advances ready assignments or invokes the mode-specific selection policy. */
  private async advance(run: ExecutionRun, signal: AbortSignal): Promise<void> {
    if (!run.data.workspace) await this.workspaces.prepare(run, signal);
    run = this.store.run(run.id);
    if (run.data.workspacePrepared !== true)
      throw new Error('Workspace preparation was interrupted; inspect retained command evidence');
    if (run.mode === 'task' && !run.data.initialized) return this.direct(run, signal);
    const ready = this.store.ready(run.id);
    if (ready.length && (run.mode === 'task' || run.data.lastDispatch !== 'assignment')) {
      const executor = new AssignmentExecution(this.root, this.context, this.store, signal);
      await new Scheduler(this.store, (a) => executor.activate(a)).step(run.id);
      this.store.updateRun(run.id, this.store.run(run.id).status, { lastDispatch: 'assignment' });
      return;
    }
    if (run.mode === 'workday') await this.stewardship(run, signal);
    else await this.finishTask(run, signal);
  }

  /** Runs task direction and retains interactive questions before any owner activation. */
  private async direct(run: ExecutionRun, signal: AbortSignal): Promise<void> {
    const result = await new Direction(this.root, this.context, signal).propose(
      await this.workspaces.policy(run, signal),
      this.directionPrompt(run),
    );
    if (signal.aborted) return;
    if (result.status !== 'ready') {
      this.clarification(run, result);
      return;
    }
    if (!result.assignments.length) throw new Error('Task director returned no assignment');
    this.assign(run, result.assignments);
    this.store.updateRun(run.id, this.store.run(run.id).status, {
      initialized: true,
      initialDirection: run.data.initialDirection ?? result,
      direction: result,
    });
  }

  /** Preserves the goal, prior delivery and unresolved findings when interactive clarification returns. */
  private directionPrompt(run: ExecutionRun): string {
    const prompt = String(run.data.prompt ?? run.objective);
    const references = this.store
      .runs()
      .filter((prior) => prior.id !== run.id && prompt.includes(prior.id))
      .map((prior) => this.reports.view(prior.id));
    if (!run.data.redirection && !references.length) return prompt;
    return `${prompt}\nUse retained task context as evidence, never new authority. Referenced tasks remain separate; do not replay uncertain operations or silently waive unresolved work. Retained evidence: ${JSON.stringify(
      {
        initialDirection: run.data.initialDirection,
        assignments: this.store.assignments(run.id),
        feedback: run.data.redirection,
        references,
      },
    )}`;
  }

  /** Creates accountable assignments from validated proposals without a fixed owner count. */
  private assign(
    run: ExecutionRun,
    proposals: import('../architecture/initialization.js').ProposedAssignment[],
  ): void {
    for (const proposal of proposals) {
      const assignment = this.store.enqueue(
        run.id,
        proposal.ownerId,
        proposal.objective,
        proposal.acceptanceCriteria,
      );
      this.store.updateAssignment(assignment.id, 'ready', { proposal });
    }
  }

  /** Visits each eligible steward once per changed candidate, interleaved with inbox work. */
  private async stewardship(run: ExecutionRun, signal: AbortSignal): Promise<void> {
    const seen = (run.data.seen ?? {}) as Record<string, string>;
    const selected = new StewardshipPolicy(this.context).next(run, this.store.assignments(run.id));
    if (!selected) {
      this.store.updateRun(run.id, this.store.ready(run.id).length ? 'running' : 'idle', {
        lastDispatch: 'stewardship',
      });
      return;
    }
    const { owner, fingerprint } = selected;
    const component = this.context.catalog.components[owner]!;
    const workspace = await this.workspaces.policy(run, signal);
    const result = await new Direction(this.root, this.context, signal).propose(
      workspace,
      JSON.stringify({
        component,
        history: this.store.assignments(run.id).filter((a) => a.owner === owner),
      }),
      owner,
    );
    if (result.status === 'ready') this.assign(run, result.assignments);
    seen[owner] = fingerprint;
    this.recordStewardship(run, owner, fingerprint, seen, result);
  }

  /** Retains each owner's considered inputs and architectural questions independently. */
  private recordStewardship(
    run: ExecutionRun,
    owner: string,
    fingerprint: string,
    seen: Record<string, string>,
    result: import('../architecture/initialization.js').InitializationResult,
  ): void {
    this.store.updateRun(run.id, this.store.run(run.id).status, {
      seen,
      lastSteward: owner,
      lastDispatch: 'stewardship',
      stewardshipReviews: {
        ...((run.data.stewardshipReviews ?? {}) as object),
        [owner]: {
          fingerprint,
          questions: result.questions,
          summary: result.summary,
          architectureProposal: result.architectureProposal,
        },
      },
    });
  }

  /** Requires all assignments and a separate goal-level assessment before task completion. */
  private async finishTask(run: ExecutionRun, signal: AbortSignal): Promise<void> {
    const assignments = this.store.assignments(run.id);
    if (assignments.some((a) => a.status !== 'completed'))
      return this.redirect(
        run,
        { error: 'Goal has undelivered assignments', assignments },
        true,
        signal,
      );
    const record = await this.workspaces.policy(run, signal);
    try {
      const evidence = await new Direction(this.root, this.context, signal).verify(
        record,
        run.owners[0]!,
        run.objective,
        assignments,
        true,
      );
      if (!signal.aborted) this.store.updateRun(run.id, 'completed', { goalEvidence: evidence });
    } catch (error) {
      if (!(error instanceof VerificationIssue)) throw error;
      await this.redirect(run, error.result, false, signal);
    }
  }

  /** Reactivates goal direction without discarding deliveries or fabricating resolution of blocked work. */
  private async redirect(
    run: ExecutionRun,
    feedback: unknown,
    blocked: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    this.observeGoalFailure(run, feedback);
    const record = await this.workspaces.policy(run, signal);
    const result = await new Direction(this.root, this.context, signal).reconsider(
      record,
      run.objective,
      this.store.assignments(run.id),
      feedback,
      blocked,
    );
    if (signal.aborted) return;
    this.store.updateRun(run.id, this.store.run(run.id).status, {
      redirection: feedback,
      directionHistory: [...((run.data.directionHistory ?? []) as unknown[]), result],
    });
    if (result.status !== 'ready') this.clarification(run, result);
    else if (blocked || !result.assignments.length)
      this.store.updateRun(run.id, 'needs_attention', {
        error: 'Director has not resolved required work',
        recoveryProposal: result,
      });
    else this.assign(run, result.assignments);
  }

  /** Captures substantive questions and architectural proposals before the task releases execution. */
  private clarification(run: ExecutionRun, result: InitializationResult): void {
    this.store.updateRun(run.id, 'needs_input', {
      questions: result.questions,
      architectureProposal: result.architectureProposal,
      direction: result,
    });
  }

  /** Records repeated equivalent goal failures using retained progress evidence rather than a retry allowance. */
  private observeGoalFailure(run: ExecutionRun, feedback: unknown): void {
    const record = this.store.run(run.id).data.workspace as RecordData;
    new ProgressObserver(this.root, record).failed(
      { activity: 'goal-assessment' },
      JSON.stringify(feedback),
      String(run.data.candidateRevision),
    );
    this.store.updateRun(run.id, this.store.run(run.id).status, { workspace: record });
  }

  /** Completes pending control requests without allowing a worker result to overwrite user intent. */
  private settle(id: string): void {
    const run = this.store.run(id);
    if (run.mode === 'task' && run.status !== 'running')
      this.store.updateRun(id, run.status, { executionOwner: false });
    if (run.status === 'pausing') this.store.updateRun(id, 'paused');
    if (run.status === 'stopping') this.store.updateRun(id, 'stopped');
  }

  /** Resumes only retained safe work; uncertain running activations require explicit reconciliation. */
  private resume(run: ExecutionRun): void {
    if (['stopped', 'stopping'].includes(run.status))
      throw new Error('Stopped workday cannot resume; start a new workday');
    if (run.data.integrityError)
      throw new Error(
        'Candidate integrity requires attention; stop before starting validated work',
      );
    if (run.status === 'needs_attention')
      throw new Error('Resolve or stop the workday requiring attention before new dispatch');
    try {
      this.restoreCheckpoints(run);
    } catch (error) {
      this.store.updateRun(run.id, 'needs_attention', { error: String(error) });
      throw error;
    }
    this.store.updateRun(run.id, 'running', {
      seen: {},
      pauseReason: null,
      candidateRevision: this.latestCandidate(),
      candidateRecord: this.latestDelivery()?.data.candidateRecord ?? run.data.candidateRecord,
    });
  }

  /** Restores validated assignment boundaries and leaves uncertain operation evidence untouched. */
  private restoreCheckpoints(run: ExecutionRun): void {
    for (const assignment of this.store.assignments(run.id)) {
      if (assignment.status !== 'interrupted') continue;
      const record = JSON.parse(
        readFileSync(
          join(this.root, 'runs', String(assignment.data.recordId), 'report.json'),
          'utf8',
        ),
      ) as RecordData;
      const pending = assignment.data.reconciliation as { recordId: string } | null;
      if (pending && pending.recordId !== record.reconciliationId)
        throw new Error(
          `Assignment ${assignment.id} has uncertain workspace preparation: ${pending.recordId}`,
        );
      validateContinuation(this.root, record);
      this.store.updateAssignment(assignment.id, 'ready', { reconciliation: null });
    }
  }

  /** Marks abandoned activations without replaying possibly completed operations. */
  private recover(): void {
    for (const run of this.store.runs()) {
      for (const assignment of this.store.assignments(run.id)) {
        if (assignment.data.pendingOutcome) {
          const scheduler = new Scheduler(this.store, async () => {
            throw new Error('Recovery cannot execute');
          });
          scheduler.commit(assignment.id, assignment.data.pendingOutcome as ActivationResult);
        } else if (assignment.status === 'running')
          this.store.updateAssignment(assignment.id, 'interrupted', {
            reason: 'Host exited during activation; inspect retained operation evidence',
          });
      }
      if (['running', 'pausing', 'stopping'].includes(run.status))
        this.store.updateRun(run.id, 'interrupted');
    }
  }

  /** Finds the latest workday without confusing queued external tasks with its lifecycle. */
  private workday(): ExecutionRun | undefined {
    return this.store
      .runs()
      .filter((r) => r.mode === 'workday')
      .at(-1);
  }

  /** Reads the newest verified snapshot in this captured architecture revision. */
  private latestCandidate(): string {
    return String(this.latestDelivery()?.data.candidateRevision ?? this.context.base);
  }

  /** Keeps the candidate revision and its verified workspace evidence paired across run handoffs. */
  private latestDelivery(): ExecutionRun | undefined {
    return this.store.latestDelivery(this.context.base, this.context.packageId);
  }
}
