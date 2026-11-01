import { validateSchema } from '../architecture/schema.js';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  EditFiles,
  editHash,
  syncEditPath,
  type CheckedChange,
  type PreparedEdit,
} from './edit-files.js';

interface EditTransaction {
  id: string;
  requestHash: string;
  authority: string;
  status: 'pending' | 'committed';
  changes: PreparedEdit[];
}

/** Owns idempotent edit transactions; callers supply authority through the bound host connection. */
export class CheckedEdits {
  private readonly files: EditFiles;

  /** Retains private evidence outside editable source and binds authorization to this assignment. */
  constructor(
    workspace: string,
    private readonly directory: string,
    private readonly authority: string,
    private readonly authorize: (path: string) => void,
  ) {
    this.assertOutside(resolve(workspace), resolve(directory));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.assertOutside(realpathSync(workspace), realpathSync(directory));
    this.files = new EditFiles(workspace);
  }

  /** Checks real containment rather than treating a child named with two dots as an ancestor. */
  private assertOutside(workspace: string, directory: string): void {
    const suffix = relative(workspace, directory);
    if (suffix !== '..' && !suffix.startsWith('../'))
      throw new Error('Edit evidence must be outside source');
  }

  /** Validates the complete batch before journaling or writing any maintained file. */
  apply(value: unknown) {
    const request = this.request(value);
    const requestHash = editHash(JSON.stringify(request));
    const path = join(this.directory, request.id + '.json');
    if (existsSync(path)) return this.retry(path, requestHash);
    this.recover();
    request.changes.forEach((change) => this.authorize(change.path));
    this.assertIndependent(request.changes);
    const transaction: EditTransaction = {
      id: request.id,
      requestHash,
      authority: this.authority,
      status: 'pending',
      changes: request.changes.map((change) => this.files.prepare(change)),
    };
    this.save(path, transaction);
    return this.finish(path, transaction);
  }

  /** Rejects file/descendant collisions before applying a partially impossible batch. */
  private assertIndependent(changes: CheckedChange[]): void {
    for (const change of changes)
      if (changes.some((other) => other !== change && other.path.startsWith(change.path + '/')))
        throw new Error('Edit batch contains overlapping file paths');
  }

  /** Reconciles only recorded before/after images; unknown state blocks dispatch. */
  recover(): void {
    for (const name of readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort()) {
      const path = join(this.directory, name);
      const transaction = this.load(path);
      if (transaction.status === 'pending') this.finish(path, transaction);
    }
  }

  /** Rejects caller-supplied identities and malformed edit semantics before scope evaluation. */
  private request(value: unknown): { id: string; changes: CheckedChange[] } {
    const input = validateSchema<{ id: string; changes: CheckedChange[] }>('checked-edits', value);
    const changes = input.changes.map((change) => this.change(change));
    if (new Set(changes.map((change) => change.path)).size !== changes.length)
      throw new Error('An edit batch cannot repeat a path');
    return { id: input.id, changes };
  }

  /** Canonicalizes explicit edit fields so equivalent JSON ordering retains retry identity. */
  private change(value: any): CheckedChange {
    if (
      !value ||
      Object.keys(value).some(
        (key) => !['path', 'operation', 'expectedSha256', 'content'].includes(key),
      ) ||
      typeof value.path !== 'string' ||
      !['create', 'update', 'delete'].includes(value.operation) ||
      (value.expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(value.expectedSha256 ?? '')) ||
      (value.operation !== 'delete' && typeof value.content !== 'string') ||
      (value.operation === 'delete' && value.content != null)
    )
      throw new Error('Malformed checked edit');
    return {
      path: value.path,
      operation: value.operation,
      expectedSha256: value.expectedSha256,
      content: value.operation === 'delete' ? null : value.content,
    };
  }

  /** Keeps a reused transaction identity bound to its original request and captured authority. */
  private retry(path: string, requestHash: string) {
    const transaction = this.load(path);
    if (transaction.requestHash !== requestHash)
      throw new Error('Edit identity reused for different changes');
    return transaction.status === 'committed'
      ? this.receipt(transaction)
      : this.finish(path, transaction);
  }

  /** Applies authorized recorded transitions and publishes a durable completion receipt. */
  private finish(path: string, transaction: EditTransaction) {
    for (const change of transaction.changes) this.files.apply(change);
    transaction.status = 'committed';
    this.save(path, transaction);
    return this.receipt(transaction);
  }

  /** Restores private evidence without allowing it to substitute another assignment's authority. */
  private load(path: string): EditTransaction {
    const transaction = JSON.parse(readFileSync(path, 'utf8')) as EditTransaction;
    if (transaction.authority !== this.authority) throw new Error('Edit authority changed');
    if (!['pending', 'committed'].includes(transaction.status))
      throw new Error('Invalid edit journal');
    return transaction;
  }

  /** Atomically persists and flushes transition evidence before acknowledging it. */
  private save(path: string, transaction: EditTransaction): void {
    writeFileSync(path + '.tmp', JSON.stringify(transaction), { mode: 0o600 });
    syncEditPath(path + '.tmp');
    renameSync(path + '.tmp', path);
    syncEditPath(this.directory);
  }

  /** Returns content identities without exposing the host's private journal location. */
  private receipt(transaction: EditTransaction) {
    return {
      id: transaction.id,
      status: 'committed',
      changes: transaction.changes.map((change) => ({
        path: change.path,
        sha256: change.after === null ? null : editHash(Buffer.from(change.after, 'base64')),
      })),
    };
  }
}
