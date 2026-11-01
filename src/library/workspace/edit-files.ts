import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { relativePath } from '../architecture/config.js';

export interface CheckedChange {
  path: string;
  operation: 'create' | 'update' | 'delete';
  expectedSha256: string | null;
  content?: string | null;
}

export interface PreparedEdit {
  path: string;
  before: string | null;
  after: string | null;
  mode: number;
}

export const editHash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

/** Validates source paths and applies only recorded byte transitions without following aliases. */
export class EditFiles {
  /** Binds all relative paths to the host-selected assignment workspace. */
  constructor(private readonly workspace: string) {}

  /** Captures the before image after validating explicit create/update/delete semantics. */
  prepare(change: CheckedChange): PreparedEdit {
    const before = this.read(change.path);
    if ((before === null) !== (change.operation === 'create'))
      throw new Error(`Stale create/update/delete state: ${change.path}`);
    if (
      (before === null ? null : editHash(Buffer.from(before, 'base64'))) !== change.expectedSha256
    )
      throw new Error(`Stale content hash: ${change.path}`);
    const path = join(this.workspace, change.path);
    return {
      path: change.path,
      before,
      after: change.operation === 'delete' ? null : Buffer.from(change.content!).toString('base64'),
      mode: before === null ? 0o644 : lstatSync(path).mode & 0o777,
    };
  }

  /** Returns exact bytes or absence after rejecting traversal, symlinks and hard links. */
  read(path: string): string | null {
    relativePath(path);
    if (path.split('/').some((part) => part.startsWith('.arcnexus-edit-')))
      throw new Error('Protected edit staging path');
    this.inspect(path);
    try {
      return readFileSync(join(this.workspace, path)).toString('base64');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Finishes a known transition once; unexpected bytes require attention rather than overwrite. */
  apply(change: PreparedEdit): void {
    const current = this.read(change.path);
    if (current === change.after) return;
    if (current !== change.before) throw new Error(`Edit recovery conflict: ${change.path}`);
    const path = join(this.workspace, change.path);
    if (change.after === null) unlinkSync(path);
    else this.replace(path, Buffer.from(change.after, 'base64'), change.mode);
    syncEditPath(dirname(path));
  }

  /** Checks every existing ancestor before source inspection or mutation. */
  private inspect(path: string): void {
    let current = resolve(this.workspace);
    for (const part of path.split('/')) {
      current = join(current, part);
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1))
          throw new Error(`Unsafe filesystem alias: ${path}`);
        if (!stat.isFile() && !stat.isDirectory())
          throw new Error(`Unsupported source entry: ${path}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  }

  /** Uses a private-name sibling for atomic replacement while preserving executable mode. */
  private replace(path: string, bytes: Buffer, mode: number): void {
    this.ensureDirectory(dirname(path));
    const temporary = join(dirname(path), `.arcnexus-edit-${editHash(bytes)}`);
    try {
      writeFileSync(temporary, bytes, { mode, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const stat = lstatSync(temporary);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        !readFileSync(temporary).equals(bytes)
      )
        throw new Error('Edit staging content changed', { cause: error });
    }
    syncEditPath(temporary);
    renameSync(temporary, path);
  }

  /** Flushes each new directory entry before a durable edit journal can acknowledge its children. */
  private ensureDirectory(path: string): void {
    try {
      if (!lstatSync(path).isDirectory()) throw new Error('Edit parent must be a directory');
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.ensureDirectory(dirname(path));
    mkdirSync(path);
    syncEditPath(dirname(path));
  }
}

/** Flushes a file or directory before publishing the next durable edit transition. */
export function syncEditPath(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
