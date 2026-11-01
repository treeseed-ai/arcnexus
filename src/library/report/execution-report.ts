import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import type { RecordData } from '../workspace/state.js';
import type { ExecutionRun } from '../coordination-store/execution-types.js';

/** Projects durable runs into compact CLI progress and inspectable reports without changing authority. */
export class ExecutionReports {
  /** Uses the same authoritative store while retaining projections beneath its project directory. */
  constructor(
    private readonly directory: string,
    private readonly store: ExecutionStore,
  ) {}

  /** Produces lifecycle, accountable work, blockers, inbox counts and verified candidate evidence. */
  view(id: string) {
    const run = this.store.run(id);
    const assignments = this.store.assignments(id).map((a) => ({
      id: a.id,
      owner: a.owner,
      objective: a.objective,
      status: a.status,
      dependencies: a.dependencies,
      evidence: a.evidence,
      reason: a.data.reason,
      recordId: a.data.recordId,
      reconciliation: a.data.reconciliation,
      progress: a.status === 'running' ? this.progress(a.data.recordId) : undefined,
      inbox: this.store.inbox(a.id).length,
    }));
    return {
      run: this.summary(run),
      assignments,
      counts: {
        ready: assignments.filter((a) => a.status === 'ready').length,
        waiting: assignments.filter((a) => a.status === 'waiting').length,
        verified: assignments.filter((a) => a.status === 'completed').length,
      },
      report: join(this.directory, 'reports', id + '.json'),
    };
  }

  /** Reads host-observed stage and completed command evidence without exposing private model reasoning. */
  private progress(id: unknown) {
    if (typeof id !== 'string') return undefined;
    const path = join(this.directory, '..', '..', 'runs', id, 'report.json');
    try {
      const record = JSON.parse(readFileSync(path, 'utf8')) as RecordData;
      const latest = record.commands.at(-1);
      return {
        stage: record.stage,
        status: record.status,
        report: path,
        completedCommands: record.commands.length,
        latestCommand: latest
          ? { command: latest.command, exitCode: latest.exitCode, log: latest.log }
          : undefined,
      };
    } catch {
      return { report: path, status: 'evidence_unavailable' };
    }
  }

  /** Retains a regenerable projection after a checkpoint; SQLite and raw harness evidence stay authoritative. */
  save(id: string): void {
    const report = this.view(id);
    mkdirSync(join(this.directory, 'reports'), { recursive: true, mode: 0o700 });
    writeFileSync(report.report + '.tmp', JSON.stringify(report, null, 2), { mode: 0o600 });
    renameSync(report.report + '.tmp', report.report);
  }

  /** Omits large captured catalogs from streaming output while preserving actionable questions and evidence. */
  private summary(run: ExecutionRun) {
    const fields = [
      'questions',
      'stewardshipReviews',
      'architectureProposal',
      'error',
      'integrityError',
      'pauseReason',
      'authorityBase',
      'authorityError',
      'executionIdentity',
      'candidateRevision',
      'verifiedEvidence',
      'goalEvidence',
      'recoveryProposal',
    ];
    const candidate = run.data.candidateRecord as { workspace?: string } | undefined;
    return {
      id: run.id,
      mode: run.mode,
      objective: run.objective,
      status: run.status,
      createdAt: run.createdAt,
      data: {
        ...Object.fromEntries(fields.map((key) => [key, run.data[key]])),
        candidateLocation: candidate?.workspace,
      },
    };
  }
}
