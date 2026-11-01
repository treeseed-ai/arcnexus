import { readFileSync } from 'node:fs';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import { candidateDigest } from '../change-inspection/changes.js';
import { assertServicesStopped } from '../operations/service-state.js';
import type { RecordData } from '../workspace/state.js';

/** Validates a completed durable boundary before a process can resume an assignment. */
export function validateContinuation(root: string, record: RecordData): void {
  const checkpoint = record.checkpoint as { path: string; sha256: string } | undefined;
  if (!record.safeCheckpoint || !checkpoint)
    throw new Error('Activation has no safe checkpoint; uncertain operations must be inspected');
  const bytes = readFileSync(checkpoint.path);
  if (digest(bytes) !== checkpoint.sha256) throw new Error('Checkpoint evidence changed');
  const value = JSON.parse(bytes.toString('utf8'));
  const authority = record.resolvedAssignment as ResolvedAssignment;
  if (value.authorityHash !== authority.digest || record.continuationAuthority !== authority.digest)
    throw new Error('Checkpoint authority mismatch');
  const expected = record.reconciledCandidateDigest ?? value.candidateDigest;
  if (candidateDigest(record) !== expected)
    throw new Error('Candidate changed outside its retained checkpoint');
  assertServicesStopped(root, record.id);
}
