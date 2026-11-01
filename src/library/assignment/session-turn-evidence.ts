import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { captureChanges } from '../change-inspection/changes.js';
import { git } from '../operations/process.js';
import { observe } from '../report/timeline.js';
import { save } from '../workspace/state.js';
import { archiveAttempt, usageDelta } from './attempts.js';
import type { SessionState } from './session-state.js';

export interface TurnFrame {
  activity: string;
  prompt: string;
  start: number;
  commandStart: number;
  before?: string;
  summary: Record<string, unknown>;
}

/** Retains prompts, SDK events, usage and structured outcomes for each model turn. */
export class TurnEvidence {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(private readonly state: SessionState) {}

  /** Marks test and instruction changes for caller inspection. */
  review(): Record<string, unknown> {
    const evidence = {
      basis: this.state.assignment.kind === 'review' ? 'base-first-parent' : 'candidate',
      base: this.state.options.record.base,
      ...(this.state.assignment.kind === 'review' ? this.baseReview() : this.candidateReview()),
    };
    const bytes = JSON.stringify(evidence);
    return { ...evidence, sha256: digest(bytes), bytes: Buffer.byteLength(bytes) };
  }

  /** Constructs the read-only review view from captured assignment inputs. */
  private baseReview() {
    const { access } = this.state.component;
    const paths = [...new Set([...access.readPaths, ...access.writeDirectories])].map(
      (p) => ':(literal)' + p,
    );
    const { record } = this.state.options;
    const patch = paths.length
      ? git(
          record.workspace,
          'show',
          '--format=fuller',
          '--first-parent',
          '--root',
          '--no-ext-diff',
          '--no-textconv',
          record.base,
          '--',
          ...paths,
        )
      : '';
    return { patch, newFiles: {} };
  }

  /** Checks the candidate at the review boundary without granting write authority. */
  private candidateReview() {
    const { root, record } = this.state.options;
    captureChanges(root, record);
    const patch = readFileSync(join(this.state.dir, 'changes.patch'), 'utf8');
    const encoded = JSON.parse(
      readFileSync(join(this.state.dir, 'new-files.json'), 'utf8'),
    ) as Record<string, string>;
    const newFiles = Object.fromEntries(
      Object.entries(encoded).map(([path, bytes]) => [
        path,
        Buffer.from(bytes, 'base64').toString('utf8'),
      ]),
    );
    return { patch, newFiles };
  }

  /** Starts managed work and records the state needed for its later shutdown. */
  start(
    activity: string,
    prompt: string,
    kind: string,
    reviewEvidence?: Record<string, unknown>,
  ): TurnFrame {
    const start = Date.now(),
      commandStart = this.state.options.record.commands.length;
    const summary: Record<string, unknown> = {
      number: this.state.turns.length + 1,
      activity,
      category: kind === 'coordination' && activity !== 'coordination' ? 'continuation' : kind,
      startedAt: new Date(start).toISOString(),
      status: 'running',
      reviewEvidence: reviewEvidence
        ? {
            basis: reviewEvidence.basis,
            base: reviewEvidence.base,
            sha256: reviewEvidence.sha256,
            bytes: reviewEvidence.bytes,
          }
        : undefined,
      promptBytes: Buffer.byteLength(prompt),
      promptSha256: digest(prompt),
      commandStart,
    };
    this.state.turns.push(summary);
    this.state.journal(activity, 'started', { turn: this.state.turns.length });
    return { activity, prompt, start, commandStart, summary };
  }

  /** Finalizes the current lifecycle while preserving its recorded outcome. */
  finish(frame: TurnFrame): void {
    const { root, record } = this.state.options;
    const { summary } = frame;
    summary.finishedAt = new Date().toISOString();
    summary.durationMs = Date.now() - frame.start;
    summary.commandEnd = record.commands.length;
    summary.threadId = record.threadId;
    this.usage(summary);
    captureChanges(root, record);
    observe(root, record, 'changes.captured', {
      changes: record.changes,
      artifacts: ['changes.patch', 'staged.patch', 'unstaged.patch', 'new-files.json'],
    });
    archiveAttempt(
      root,
      record,
      this.state.turns.length,
      frame.commandStart,
      frame.prompt,
      'turns',
    );
    delete record.attemptReportedUsage;
    this.state.checkpoint();
    save(root, record);
  }

  /** Preserves raw usage and derives accounting without counting cumulative values twice. */
  private usage(summary: Record<string, unknown>): void {
    const { record } = this.state.options;
    summary.reportedUsage = record.attemptReportedUsage ?? null;
    const delta =
      this.state.turns.length > 1 && record.usage === null
        ? null
        : usageDelta(record.usage, record.attemptReportedUsage);
    summary.usage = delta;
    record.usageComplete = record.usageComplete === true && delta !== null;
    record.usage = record.attemptReportedUsage ?? null;
    record.usageBasis =
      record.evidenceMode === 'simulation'
        ? 'Scripted simulation counters; no model inference'
        : 'thread-cumulative Codex counters; per-turn deltas';
  }
}
