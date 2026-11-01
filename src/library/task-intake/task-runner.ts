import { TaskAuthority } from './task-authority.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, resolveAssignment, type ResolvedAssignment } from '../architecture/assignment.js';
import { loadBindings } from '../architecture/bindings.js';
import { InputError } from '../architecture/config.js';
import { runSteward } from '../assignment/steward.js';
import { captureChanges } from '../change-inspection/changes.js';
import { git } from '../operations/process.js';
import { saveMarkdown } from '../report/report.js';
import { save, type RecordData } from '../workspace/state.js';
import { createWorkspace } from '../workspace/workspace.js';
import { ProposalStore, type TaskProposal } from './proposal-store.js';

/** Executes explicitly accepted proposals only while captured authority hashes still match. */
export class TaskRunner {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private root: string,
    private signal: AbortSignal,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(id: string): Promise<{ exitCode: number; report: unknown }> {
    const proposal = new ProposalStore(this.root).load(id);
    this.validate(proposal);
    writeFileSync(
      join(this.root, 'proposals', id + '.accepted.json'),
      JSON.stringify({ proposalHash: proposal.digest, acceptedAt: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600, flush: true },
    );
    const execution = proposal.execution!;
    if (execution.kind === 'workday') {
      const { WorkdayRunner } = await import('../workday/workday.js');
      const report = await new WorkdayRunner(this.root, this.signal, proposal.executable).run(
        execution.input,
        undefined,
        { ...proposal.initialization, authorityHash: execution.input.digest },
      );
      return { exitCode: report.exitCode, report };
    }
    return this.single(proposal, execution.resolved);
  }

  /** Rejects inputs that violate the captured configuration contract. */
  private validate(proposal: TaskProposal): void {
    if (proposal.status !== 'ready' || !proposal.execution)
      throw new InputError('Proposal is not ready for execution');
    if (
      git(proposal.source, 'rev-parse', 'HEAD').trim() !== proposal.sourceHead ||
      git(proposal.source, 'status', '--porcelain').trim()
    )
      throw new InputError('Source changed; create a new task plan');
    new TaskAuthority().verify(proposal);
    if (digest(readFileSync(proposal.request.path)) !== proposal.request.hash)
      throw new InputError('Request or supervising build changed; create a new task plan');
    const assignments =
      proposal.execution.kind === 'run'
        ? [proposal.execution.resolved]
        : [
            proposal.execution.input.requester.resolved,
            proposal.execution.input.recipient.resolved,
          ];
    for (const assignment of assignments) this.revalidate(proposal, assignment);
  }

  /** Checks captured hashes again before executing an accepted proposal. */
  private revalidate(proposal: TaskProposal, assignment: ResolvedAssignment): void {
    const resolved = resolveAssignment(proposal.source, proposal.base, assignment.componentId, {
      value: assignment.assignment,
      bindings: loadBindings(proposal.bindingsPath),
      initializerModel: assignment.initialization.model,
    });
    if (resolved.digest !== assignment.digest)
      throw new InputError('Captured authority or checks changed; create a new task plan');
    if (proposal.execution?.kind === 'workday')
      for (const artifact of proposal.execution.input.artifacts)
        if (digest(readFileSync(artifact.path)) !== artifact.sha256)
          throw new InputError('Combined acceptance changed');
  }

  /** Handles single within this component’s captured contract. */
  private async single(proposal: TaskProposal, resolved: ResolvedAssignment) {
    const record = createWorkspace(this.root, {
      project: proposal.source,
      base: proposal.base,
      bindings: resolved.bindings,
    });
    record.resolvedAssignment = resolved;
    record.acceptedProposal = proposal.id;
    let exitCode = 0;
    try {
      await this.execute(proposal, resolved, record);
    } catch (error) {
      exitCode = this.signal.aborted ? 130 : 1;
      record.status = this.signal.aborted
        ? 'cancelled'
        : ['blocked', 'needs_attention', 'no_changes'].includes(record.status)
          ? record.status
          : 'failed';
      record.error = String(error);
    } finally {
      this.finish(record);
    }
    return { exitCode, report: record };
  }

  /** Runs the requested action through the configured execution boundary. */
  private async execute(proposal: TaskProposal, resolved: ResolvedAssignment, record: RecordData) {
    const controller = new AbortController();
    const seconds = resolved.executionProfile.timeoutSeconds;
    const timer =
      seconds === undefined
        ? undefined
        : setTimeout(
            () => controller.abort(new Error('Assignment deadline exhausted')),
            seconds * 1000,
          );
    try {
      await runSteward(
        this.root,
        record,
        resolved.componentId,
        resolved.assignment.objective,
        resolved.executionProfile.model,
        proposal.executable,
        AbortSignal.any([this.signal, controller.signal]),
        resolved.executionProfile.maxAttempts,
        { ...proposal.initialization, authorityHash: resolved.digest },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Finalizes the current lifecycle while preserving its recorded outcome. */
  private finish(record: RecordData): void {
    record.finishedAt = new Date().toISOString();
    record.elapsedMs = Date.now() - Date.parse(record.startedAt);
    captureChanges(this.root, record);
    save(this.root, record);
    saveMarkdown(this.root, record);
  }
}
