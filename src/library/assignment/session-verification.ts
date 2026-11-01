import { CapturedVerification } from './captured-verification.js';
import { RefactorCheckpoint } from './refactor-checkpoint.js';
import { assertCapturedTests } from '../testing/captured-tests.js';
import { SessionProgress } from './session-progress.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateDigest } from '../change-inspection/changes.js';
import { type CommandResult } from '../operations/process.js';
import { type AgentResult } from '../steward/codex.js';
import { specificationFiles, withFrozenTests } from './checkpoints.js';
import { SessionState } from './session-state.js';

/** Enforces expected-red, frozen-test and final independent verification checkpoints. */
export class SessionVerification {
  /** Uses captured session checks and scope for authoritative verification. */
  constructor(private readonly state: SessionState) {}

  /** Freezes regression files and requires the declared expected-red checkpoint. */
  async specification(spec: AgentResult) {
    if (this.state.assignment.changeType === 'refactor')
      return new RefactorCheckpoint(this.state).prepare();
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

  /** Freezes the specification files outside the candidate before implementation. */
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

  /** Matches the observed failure to the steward’s declared diagnostic. */
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

  /** Runs the declared regression and retains its diagnostic for the red checkpoint. */
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

  /** Rechecks scope, captured suites, frozen tests and independent acceptance. */
  async final() {
    this.assertCandidate();
    const { record } = this.state.options;
    if (
      record.generalExecution &&
      record.finalVerifiedBase === record.base &&
      record.finalVerifiedDigest === candidateDigest(record)
    )
      return;
    assertCapturedTests(this.state.component, this.state.options.record.workspace);
    for (const c of this.state.component.verification) await this.state.command(c, 'verification');
    assertCapturedTests(this.state.component, this.state.options.record.workspace);
    this.state.safe();
    await this.verifyFrozen();
    for (const c of this.state.hostChecks) await this.state.command(c, 'acceptance');
    this.assertCandidate();
    record.finalVerifiedDigest = candidateDigest(record);
    record.finalVerifiedBase = record.base;
    new SessionProgress(this.state).verified('final-verification');
  }

  /** Rechecks frozen behavioral, characterization and original acceptance sources independently. */
  private async verifyFrozen(): Promise<void> {
    if (this.state.regression)
      await withFrozenTests(this.state.options.record, this.state.frozen, async () => {
        await this.state.command(
          this.state.component.verification[this.state.regression!.verificationIndex]!,
          'frozen-regression',
        );
        this.state.safe();
      });
    await new RefactorCheckpoint(this.state).verify();
    await new CapturedVerification(this.state).verify();
  }

  /** Requires an in-scope implementation both before checks and after their side effects. */
  private assertCandidate(): void {
    this.state.safe();
    if (this.state.assignment.kind === 'change' && !this.state.ownChanges().length) {
      this.state.options.record.status = 'no_changes';
      this.state.options.record.outcome = 'no_changes';
      throw new Error('Candidate has no changes');
    }
  }
}
