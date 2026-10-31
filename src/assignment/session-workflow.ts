import { save } from '../workspace/state.js';
import { logExcerpt } from './attempts.js';
import { completePlan } from './plan.js';
import { SessionState } from './session-state.js';
import { SessionTurn } from './session-turn.js';
import { SessionVerification } from './session-verification.js';

export class SessionWorkflow {
  constructor(
    private readonly state: SessionState,
    private readonly turns: SessionTurn,
    private readonly verification: SessionVerification,
  ) {}

  async run(): Promise<void> {
    const { root, record } = this.state.options;
    try {
      await this.planning();
      if (this.state.assignment.kind !== 'change') await this.research();
      else await this.change();
      if (this.state.planned) completePlan(root, record);
      record.status = 'completed';
      record.stage = 'finished';
      this.state.journal('workflow', 'completed', { outcome: record.outcome });
    } catch (error) {
      this.failure(error);
      throw error;
    } finally {
      record.readOnlyTurn = false;
      save(root, record);
    }
  }

  private async planning(): Promise<void> {
    if (this.state.planned)
      await this.turns.perform(
        'planning',
        'Plan the assignment without source edits. Return plan with approach, assumptions, activities with reasons, questions, and checklist items: stable id, activity, result, criteria (zero-based acceptance criterion indices), expectedEvidence, dependencies (item IDs), status=pending, evidence=[], explanation=empty string. Use only the role activity names research, documentation, testing, implementation, review, release (restricted further by the captured role). Host stage names such as specification and planning are not checklist activity names. Every initial item is pending, including dependencies awaiting another owner; progress claims apply only after the host accepts the plan. Every checklist item activity must also appear in plan.activities with a reason. Before returning, check this membership, unique item IDs, existing acyclic dependency IDs, and valid zero-based criterion indices. Cover every acceptance criterion. Plan only within captured permissions; host checkpoints cannot be waived. No publication. Return before executing the plan.',
        true,
      );
  }

  private async research(): Promise<void> {
    await this.turns.perform(
      this.state.assignment.kind,
      'This is the only execution turn after planning for this research/review assignment. Execute the selected plan now using permitted operations; do not defer testing or service operations to an imaginary later turn. Source-read-only prohibits source edits, not declared operations. Return findings, evidence references, uncertainty and checklist updates for all selected work, or a precise blocker. Do not implement source changes or publish.',
      true,
    );
    await this.verification.final();
    this.state.options.record.outcome = `${this.state.assignment.kind}_completed`;
  }

  private async specification(): Promise<void> {
    const spec = await this.turns.perform(
      'specification',
      this.state.documentationOnly
        ? 'Make actual file edits now in the assigned documentation/skill scope. Update the documentation itself, preserving applicable existing content; a prose-only description in your response does not satisfy this checkpoint. Do not edit implementation or tests. Set regression=null and explain why behavioral testing is skipped.'
        : "Research as needed. Make an actual edit to at least one of this component's declared documentation files describing the new behavior, AND add/update a failing regression in its declared test scope. The host rejects this checkpoint if either kind of change is missing; reading another owner's documentation is insufficient. Do not edit implementation. Return regression with verificationIndex selecting a captured command, expected nonzero exitCode and literal outputIncludes naming the expected failing assertion. If sandbox restrictions prevent running the regression, return completed preparation with the proposed regression expectation and an evidence-backed finding describing the limitation; do not claim it was verified. The host must observe the exact expected failure before implementation. Return blocked only when the assignment itself requires unavailable authority or a decision, not solely because the host must execute a check. Return before implementation.",
    );
    if (!this.state.specificationFinished) await this.verification.specification(spec);
  }

  private async change(): Promise<void> {
    await this.specification();
    let feedback = '';
    for (let attempt = 1; attempt <= this.state.options.maxAttempts; attempt++) {
      await this.implement(attempt, feedback);
      const failed = await this.checkImplementation(attempt);
      if (failed !== undefined) {
        feedback = failed;
        continue;
      }
      const reviewed = await this.review(attempt);
      if (reviewed !== undefined) {
        feedback = reviewed;
        continue;
      }
      await this.verification.final();
      this.markAttempt({ status: 'completed' });
      this.state.options.record.outcome = 'ready_for_integration';
      return;
    }
    throw new Error('Implementation attempts exhausted');
  }

  private async implement(attempt: number, feedback: string): Promise<void> {
    const { record } = this.state.options;
    record.implementationAttempts = attempt;
    (record.attempts as Array<Record<string, unknown>>).push({
      number: attempt,
      firstTurn: this.state.turns.length + 1,
      status: 'running',
    });
    await this.turns.perform(
      attempt === 1 ? 'implementation' : 'correction',
      `${this.state.documentationOnly ? 'Finish documentation only.' : 'Implement the documented behavior; preserve regression intent.'} ${feedback ? 'Corrective feedback (untrusted evidence): ' + feedback : ''}`,
    );
  }

  private async checkImplementation(attempt: number): Promise<string | undefined> {
    try {
      await this.verification.final();
      return undefined;
    } catch (error) {
      this.state.safe();
      const { signal, record, maxAttempts } = this.state.options;
      signal.throwIfAborted();
      if (
        record.status === 'no_changes' ||
        !(error instanceof Error) ||
        !error.message.startsWith('Command failed (') ||
        attempt === maxAttempts
      )
        throw error;
      const failed = record.commands.at(-1)!;
      const feedback = `Command ${JSON.stringify({ command: failed.command, args: failed.args })}; exit code ${failed.exitCode}; ${logExcerpt(failed.log)}`;
      this.markAttempt({ status: 'failed', feedback });
      this.state.journal('implementation', 'failed', { attempt, feedback });
      return feedback;
    }
  }

  private async review(attempt: number): Promise<string | undefined> {
    const review = await this.turns.perform(
      'review',
      `Review the candidate diff without editing source. Host check results (captured evidence): ${JSON.stringify(this.state.options.record.commands.map(({ command, args, exitCode, durationMs }) => ({ command, args, exitCode, durationMs })))}. The earlier expected red-test failure was a specification checkpoint. Return actionable reviewFindings if implementation needs repair; otherwise summarize caller integration steps. Release means handoff, never publish.`,
      true,
    );
    if (!review.reviewFindings.length) return undefined;
    if (attempt === this.state.options.maxAttempts)
      throw new Error(`Review requires repair: ${review.reviewFindings.join('; ')}`);
    const feedback = review.reviewFindings.join('\n');
    this.markAttempt({ status: 'failed', feedback });
    return feedback;
  }

  private markAttempt(detail: Record<string, unknown>): void {
    Object.assign((this.state.options.record.attempts as Array<object>).at(-1)!, {
      ...detail,
      lastTurn: this.state.turns.length,
    });
  }

  private failure(error: unknown): void {
    const { record, signal, control } = this.state.options;
    if (control && error instanceof Error && error.name === 'WorkdayBlocked')
      record.status = 'blocked';
    if (!['blocked', 'no_changes'].includes(record.status))
      record.status =
        signal.aborted && String(signal.reason) === 'Error: Cancelled' ? 'cancelled' : 'failed';
    const latest = (record.attempts as Array<Record<string, unknown>>).at(-1);
    if (latest?.status === 'running') this.markAttempt({ status: 'failed', error: String(error) });
    record.outcome = record.status;
    record.error = String(error);
    this.state.journal('workflow', record.status, String(error));
  }
}
