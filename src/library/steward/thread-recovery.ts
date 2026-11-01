import { readFileSync } from 'node:fs';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import { candidateDigest } from '../change-inspection/changes.js';
import { observe } from '../report/timeline.js';
import { save } from '../workspace/state.js';
import type { CodexInput } from './codex-configuration.js';

/** Replaces only explicitly missing threads; uncertain inference or operation execution is never replayed. */
export class ThreadRecovery {
  private readonly before: string;

  /** Captures candidate and operation state before a resume attempt can begin. */
  constructor(private readonly input: CodexInput) {
    this.before = this.state();
  }

  /** Requires an explicit missing-thread response and unchanged state before allowing substitution. */
  permits(error: unknown): boolean {
    return (
      !!this.input.record.generalExecution &&
      !!this.input.resumeId &&
      !this.input.signal.aborted &&
      error instanceof Error &&
      /^(?:thread|session) not found:/i.test(error.message) &&
      this.state() === this.before
    );
  }

  /** Restores continuation evidence under unchanged authority and records why the old identity was replaced. */
  replace(error: unknown): void {
    const { root, record } = this.input;
    const checkpoint = record.checkpoint as { path: string; sha256: string } | undefined;
    if (!checkpoint) throw new Error('Missing thread has no validated continuation checkpoint');
    const bytes = readFileSync(checkpoint.path);
    const captured = JSON.parse(bytes.toString('utf8'));
    const authority = record.resolvedAssignment as ResolvedAssignment;
    if (digest(bytes) !== checkpoint.sha256 || captured.authorityHash !== authority.digest)
      throw new Error('Missing thread checkpoint or authority changed');
    const substitution = {
      previous: this.input.resumeId,
      reason: String(error),
      checkpoint,
      at: new Date().toISOString(),
    };
    record.threadSubstitutions = [
      ...((record.threadSubstitutions ?? []) as object[]),
      substitution,
    ];
    observe(root, record, 'thread.substituted', substitution);
    delete this.input.resumeId;
    delete record.threadId;
    this.input.prompt +=
      '\nContinue on a fresh thread from this captured checkpoint; it does not grant new authority:\n' +
      bytes.toString('utf8');
    save(root, record);
  }

  /** Includes observed operations and checklist calls so even a source-read-only side effect forbids replay. */
  private state(): string {
    const { record } = this.input;
    return JSON.stringify({
      base: record.base,
      candidate: candidateDigest(record),
      operations: record.operationCalls ?? 0,
      plans: record.planUpdateCalls ?? 0,
      commands: record.commands.length,
    });
  }
}
