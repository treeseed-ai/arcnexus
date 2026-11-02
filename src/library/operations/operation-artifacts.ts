import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { relativePath } from '../architecture/config.js';
import type { RecordData } from '../workspace/state.js';

export interface OperationArtifact {
  path: string;
  sha256: string;
  artifact: string;
}

/** Captures immutable copies of generated evidence for both agent and host operation invocations. */
export class OperationArtifacts {
  /** Binds artifacts to private run storage, never to an agent-selected evidence destination. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
  ) {}

  /** Rejects aliases and oversized artifacts before retaining their exact observed bytes. */
  capture(path: string, invocation: string): OperationArtifact {
    relativePath(path);
    const source = join(this.record.workspace, path);
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.nlink !== 1 || realpathSync(source) !== source)
      throw new Error('Operation artifact must be a regular non-symlink file');
    if (stat.size > 64 * 1024 * 1024) throw new Error('Operation artifact limit exceeded');
    const bytes = readFileSync(source);
    const run = join(this.root, 'runs', this.record.id);
    const dir = join(run, 'operation-artifacts', invocation);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const sha256 = digest(bytes);
    writeFileSync(join(dir, sha256), bytes, { mode: 0o600 });
    return { path, sha256, artifact: relative(run, join(dir, sha256)) };
  }
}
