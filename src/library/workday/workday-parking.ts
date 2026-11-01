import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { changes, checkScope } from '../change-inspection/changes.js';
import { git } from '../operations/process.js';
import type { RecordData } from '../workspace/state.js';
import { assertIdentity } from '../workspace/workspace.js';

interface FileState {
  content: string;
  mode: number;
}

interface Entry {
  path: string;
  working: FileState | null;
  index: { mode: string; oid: string; content: string } | null;
}

export function entry(record: RecordData, path: string): Entry {
  checkScope(record.workspace, [{ path, kind: 'M' }], [path]);
  const file = join(record.workspace, path),
    stat = lstatSync(file, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw new Error('Candidate path is not a regular file: ' + path);
  return {
    path,
    working: stat
      ? {
          content: readFileSync(file).toString('base64'),
          mode: stat.mode & 0o777,
        }
      : null,
    index: indexEntry(record.workspace, path),
  };
}

function indexEntry(workspace: string, path: string): Entry['index'] {
  const rows = git(workspace, 'ls-files', '--stage', '-z', '--', path).split('\0').filter(Boolean);
  if (rows.length > 1 || rows.some((r) => !/^\d+ [a-f0-9]+ 0\t/.test(r)))
    throw new Error('Unmerged index is unsupported');
  const fields = rows[0]?.split('\t')[0]?.split(' ');
  if (!fields) return null;
  return {
    mode: fields[0]!,
    oid: fields[1]!,
    content: execFileSync('git', ['-C', workspace, 'cat-file', 'blob', fields[1]!]).toString(
      'base64',
    ),
  };
}

function syncPath(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function snapshotChanges(record: RecordData): Entry[] {
  return changes(record).map((c) => entry(record, c.path));
}

export function assertOwner(record: RecordData, scope: string[], foreign: Entry[]): void {
  assertIdentity(record);
  const owns = (p: string) => scope.some((q) => q === '.' || p === q || p.startsWith(q + '/'));
  for (const original of foreign) {
    if (JSON.stringify(entry(record, original.path)) !== JSON.stringify(original))
      throw new Error('Other-owner candidate changed: ' + original.path);
  }
  const allowedForeign = new Set(foreign.map((e) => e.path));
  checkScope(
    record.workspace,
    changes(record).filter((c) => !allowedForeign.has(c.path)),
    scope,
  );
  if (foreign.some((e) => owns(e.path)))
    throw new Error('Foreign checkpoint overlaps owner authority');
}

/** Preserves requester bytes, modes and index state across a shared-worktree handoff. */
export class WorktreeParking {
  status = 'none';

  private entries: Entry[] = [];

  private baseline: Entry[] = [];

  private hash = '';

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private record: RecordData,
    readonly path: string,
  ) {}

  /** Persists the current evidence so later inspection can reconstruct this state. */
  private save() {
    const bytes =
      JSON.stringify(
        {
          schemaVersion: 1,
          workspace: this.record.workspace,
          base: this.record.base,
          branch: this.record.branch,
          status: this.status,
          entries: this.entries,
          baseline: this.baseline,
          hash: this.hash,
        },
        null,
        2,
      ) + '\n';
    writeFileSync(this.path + '.tmp', bytes, { mode: 0o600 });
    syncPath(this.path + '.tmp');
    renameSync(this.path + '.tmp', this.path);
    syncPath(dirname(this.path));
  }

  /** Handles park within this component’s captured contract. */
  park(scope: string[]): void {
    assertIdentity(this.record);
    this.entries = snapshotChanges(this.record);
    checkScope(
      this.record.workspace,
      this.entries.map((e) => ({ path: e.path, kind: 'M' })),
      scope,
    );
    this.hash = digest(JSON.stringify(this.entries));
    this.status = 'parking';
    this.save();
    for (const item of this.entries) this.restoreBase(item);
    this.baseline = this.entries.map((e) => entry(this.record, e.path));
    assertIdentity(this.record);
    this.status = 'parked';
    this.save();
  }

  /** Restores the captured baseline view without creating a Git commit. */
  private restoreBase(item: Entry): void {
    const tree = git(this.record.workspace, 'ls-tree', this.record.base, '--', item.path);
    if (tree) {
      git(
        this.record.workspace,
        'restore',
        '--source=' + this.record.base,
        '--staged',
        '--worktree',
        '--',
        item.path,
      );
    } else {
      git(this.record.workspace, 'rm', '--cached', '--ignore-unmatch', '--', item.path);
      const p = join(this.record.workspace, item.path);
      if (existsSync(p)) unlinkSync(p);
    }
  }

  /** Handles restore within this component’s captured contract. */
  restore(): void {
    if (this.status === 'restored' || this.status === 'none') return;
    if (this.status !== 'parked') throw new Error('Parking transition is unresolved');
    assertIdentity(this.record);
    this.validateParked();
    const parkedPaths = new Set(this.entries.map((e) => e.path)),
      foreign = snapshotChanges(this.record).filter((e) => !parkedPaths.has(e.path));
    this.status = 'restoring';
    this.save();
    for (const item of this.entries) this.restoreEntry(item);
    for (const original of [...this.entries, ...foreign])
      if (JSON.stringify(entry(this.record, original.path)) !== JSON.stringify(original))
        throw new Error('Restoration did not preserve candidate');
    assertIdentity(this.record);
    this.status = 'restored';
    this.save();
  }

  /** Checks retained parking evidence before restoring candidate content. */
  private validateParked(): void {
    const persisted = JSON.parse(readFileSync(this.path, 'utf8'));
    if (
      persisted.hash !== this.hash ||
      digest(JSON.stringify(persisted.entries)) !== this.hash ||
      JSON.stringify(persisted.baseline) !== JSON.stringify(this.baseline)
    )
      throw new Error('Parked evidence changed');
    for (const before of this.baseline)
      if (JSON.stringify(entry(this.record, before.path)) !== JSON.stringify(before))
        throw new Error('Parked path was replaced: ' + before.path);
  }

  /** Restores one captured file entry, preserving its recorded state. */
  private restoreEntry(item: Entry): void {
    this.restoreIndex(item);
    const p = join(this.record.workspace, item.path);
    if (item.working) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, Buffer.from(item.working.content, 'base64'));
      chmodSync(p, item.working.mode);
    } else if (existsSync(p)) unlinkSync(p);
  }

  /** Restores the recorded staging state independently of working-tree bytes. */
  private restoreIndex(item: Entry): void {
    if (item.index) {
      const oid = execFileSync(
        'git',
        ['-C', this.record.workspace, 'hash-object', '-w', '--stdin'],
        {
          input: Buffer.from(item.index.content, 'base64'),
          encoding: 'utf8',
        },
      ).trim();
      if (oid !== item.index.oid) throw new Error('Parked index blob hash mismatch');
      git(
        this.record.workspace,
        'update-index',
        '--add',
        '--cacheinfo',
        item.index.mode,
        item.index.oid,
        item.path,
      );
    } else git(this.record.workspace, 'rm', '--cached', '--ignore-unmatch', '--', item.path);
  }
}
