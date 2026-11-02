import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import { git } from '../operations/process.js';
import { CheckedEdits } from '../workspace/checked-edits.js';
import { assertIdentity } from '../workspace/workspace.js';
import { save, type RecordData } from '../workspace/state.js';

/** Binds private transaction evidence to the captured assignment rather than model-supplied identities. */
export function checkedEditAuthority(record: RecordData): string {
  const resolved = record.resolvedAssignment as ResolvedAssignment;
  return digest(JSON.stringify([resolved.digest, record.assignmentId ?? record.id]));
}

/** Repairs known filesystem transitions without declaring a model activation or operation complete. */
export function recoverAssignmentEdits(root: string, record: RecordData): boolean {
  const resolved = record.resolvedAssignment as ResolvedAssignment | undefined;
  const directory = join(root, 'runs', record.id, 'checked-edits');
  if (resolved?.context.at(-1)?.schemaVersion !== 5 || !existsSync(directory)) return false;
  try {
    assertEditIdentity(record);
    const transactions = new CheckedEdits(
      record.workspace,
      directory,
      checkedEditAuthority(record),
      () => {
        throw new Error('Recovery cannot authorize new edits');
      },
    ).recover();
    record.editRecovery = { status: 'reconciled', transactions };
    if (transactions.length) {
      record.safeCheckpoint = false;
      record.status = 'interrupted';
    }
    return transactions.length > 0;
  } catch (error) {
    record.editRecovery = { status: 'needs_attention', error: String(error) };
    record.safeCheckpoint = false;
    record.status = 'needs_attention';
    throw error;
  } finally {
    save(root, record);
  }
}

/** Requires the original worktree and Git administration identity before applying retained edits. */
function assertEditIdentity(record: RecordData): void {
  assertIdentity(record);
  const common = git(
    record.workspace,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ).trim();
  if (realpathSync(common) !== record.commonDir)
    throw new Error('Edit recovery repository identity changed');
}
