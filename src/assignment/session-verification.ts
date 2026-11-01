import { SessionProgress } from './session-progress.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changes } from '../change-inspection/changes.js';
import { type CommandResult } from '../operations/process.js';
import { type AgentResult } from '../steward/codex.js';
import { specificationFiles, withFrozenTests } from './checkpoints.js';
import { SessionState } from './session-state.js';
export class SessionVerification {
  constructor(private readonly state: SessionState) {}
  async specification(spec: AgentResult) {
    if (!this.state.ownChanges().length) {
      this.state.options.record.status = 'no_changes';
      this.state.options.record.outcome = 'no_changes';
      throw new Error('Candidate has no changes');
    }
    this.captureRegression();
    if (!this.state.documentationOnly) await this.regression(spec);
    else
      this.state.journal('testing', 'skipped', {
        reason:
          'Caller declared documentation-only assignment; project verification remains required',
      });

    this.state.specificationFinished = true;
    this.state.checkpoint();
    new SessionProgress(this.state).verified('specification');
  }
  private captureRegression(): void {
    this.state.frozen = specificationFiles(
      this.state.options.record,
      this.state.component,
      this.state.documentationOnly,
      this.state.ownChanges(),
    );
    this.state.options.record.frozenTests = this.state.frozen;
    writeFileSync(
      join(this.state.dir, 'frozen-tests.json'),
      JSON.stringify(this.state.frozen, null, 2) + '\n',
      {
        mode: 0o600,
      },
    );
  }
  private async regression(spec: AgentResult): Promise<void> {
    this.state.regression = spec.regression;
    if (
      !this.state.regression ||
      !this.state.component.verification[this.state.regression.verificationIndex]
    )
      throw new Error('Missing/invalid regression checkpoint');
    const failed = await this.expectedFailure();
    this.state.safe();
    if (
      !failed ||
      failed.exitCode !== this.state.regression.exitCode ||
      !readFileSync(failed.log, 'utf8').includes(this.state.regression.outputIncludes)
    )
      throw new Error('Regression did not fail with the expected assertion');
    this.state.options.record.regressionCheckpoint = this.state.regression;
    this.state.journal('testing', 'completed', {
      host: 'expected regression failure observed',
      regression: this.state.regression,
    });
  }

  private async expectedFailure(): Promise<CommandResult | undefined> {
    let failed: CommandResult | undefined;
    try {
      await this.state.command(
        this.state.component.verification[this.state.regression!.verificationIndex]!,
        'red-test',
      );
    } catch (error) {
      this.state.options.signal.throwIfAborted();
      if (
        error instanceof Error &&
        error.message.startsWith('Command failed (') &&
        'commandResult' in error
      )
        failed = error.commandResult as CommandResult;
      else throw error;
    }
    return failed;
  }
  async final() {
    this.state.safe();
    if (this.state.assignment.kind === 'change' && !this.state.ownChanges().length) {
      this.state.options.record.status = 'no_changes';
      this.state.options.record.outcome = 'no_changes';
      throw new Error('Candidate has no changes');
    }
    for (const c of this.state.component.verification) await this.state.command(c, 'verification');
    this.state.safe();
    if (this.state.regression)
      await withFrozenTests(this.state.options.record, this.state.frozen, async () => {
        await this.state.command(
          this.state.component.verification[this.state.regression!.verificationIndex]!,
          'frozen-regression',
        );
        this.state.safe();
      });
    for (const c of this.state.hostChecks) await this.state.command(c, 'acceptance');
    this.state.safe();
    if (this.state.assignment.kind === 'change' && !changes(this.state.options.record).length) {
      this.state.options.record.status = 'no_changes';
      this.state.options.record.outcome = 'no_changes';
      throw new Error('Candidate has no changes');
    }
    new SessionProgress(this.state).verified('final-verification');
  }
}
