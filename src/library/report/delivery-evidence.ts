import { lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { ExecutionAssignment } from '../coordination-store/execution-types.js';
import type { RecordData } from '../workspace/state.js';
import { ExecutionObservations } from './execution-observations.js';

/** Makes independently verified supplier assessments readable without exposing arbitrary private paths. */
export class DeliveryEvidence {
  /** Retains the application-owned evidence root used to validate each durable delivery reference. */
  constructor(private readonly root: string) {}

  /** Projects only completed deliveries and keeps missing or mismatched verification explicit. */
  capture(assignment: ExecutionAssignment): unknown[] {
    if (assignment.status !== 'completed') return [];
    return assignment.evidence.map((reference) => this.reference(assignment, reference));
  }

  /** Reads only a matching verifier report within the private run directory. */
  private reference(assignment: ExecutionAssignment, reference: string): unknown {
    try {
      const id = basename(dirname(reference));
      const directory = join(this.root, 'runs', id);
      if (!/^[a-f0-9-]{36}$/.test(id) || resolve(reference) !== resolve(directory, 'report.json'))
        throw new Error('Invalid independent verification reference');
      if (!lstatSync(reference).isFile()) throw new Error('Verification is not a regular file');
      const record = JSON.parse(readFileSync(reference, 'utf8')) as RecordData;
      this.validate(record, assignment, id);
      return this.project(record, directory);
    } catch (error) {
      return { evidenceUnavailable: true, reason: String(error) };
    }
  }

  /** Rejects foreign, worker-authored or unfinished reports even when a delivery pointer exists. */
  private validate(record: RecordData, assignment: ExecutionAssignment, id: string): void {
    if (
      record.id !== id ||
      record.executionRunId !== assignment.runId ||
      record.assignmentId !== assignment.id ||
      record.parentRecordId !== assignment.data.recordId ||
      record.activationRole !== 'verifier' ||
      record.status !== 'completed' ||
      (record.agent as { status?: string } | undefined)?.status !== 'completed'
    )
      throw new Error('Independent verification identity or completion does not match delivery');
  }

  /** Separates the independent assessment, reviewed candidate and observed checks from worker claims. */
  private project(record: RecordData, directory: string) {
    const reviewed = record.verificationEvidence as Record<string, unknown> | undefined;
    if (!reviewed?.candidateDigest) throw new Error('Reviewed candidate identity is unavailable');
    return {
      recordId: record.id,
      runId: record.executionRunId,
      assignmentId: record.assignmentId,
      parentRecordId: record.parentRecordId,
      role: record.activationRole,
      reviewedCandidate: {
        baseline: reviewed.baseline,
        candidateDigest: reviewed.candidateDigest,
        changes: reviewed.changes,
      },
      acceptanceCriteria: record.acceptanceCriteria,
      assessment: record.agent,
      observations: new ExecutionObservations(directory).capture(record),
    };
  }
}
