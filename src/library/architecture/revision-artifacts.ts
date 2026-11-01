import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { git } from '../operations/process.js';

/** Reads exact tracked bytes and rejects symlink or submodule traversal. */
export class RevisionArtifacts {
  private readonly modes = new Map<string, string>();

  /** Inventories captured Git modes for safe, revision-bound artifact reads. */
  constructor(
    private readonly repository: string,
    private readonly base: string,
  ) {
    for (const entry of git(repository, 'ls-tree', '-r', '-t', '-z', base)
      .split('\0')
      .filter(Boolean)) {
      const separator = entry.indexOf('\t');
      this.modes.set(entry.slice(separator + 1), entry.slice(0, separator).split(' ')[0]!);
    }
  }

  /** Rejects invalid or escaping paths before resolving their content. */
  validatePath(path: string): void {
    const segments = path.split('/');
    for (let i = 1; i <= segments.length; i++) {
      const mode = this.modes.get(segments.slice(0, i).join('/'));
      if (mode === '120000' || mode === '160000')
        throw new Error(`Reference traverses symlink or submodule: ${path}`);
    }
  }

  /** Loads the requested content through this component boundary. */
  read(path: string) {
    this.validatePath(path);
    if (!['100644', '100755'].includes(this.modes.get(path) ?? ''))
      throw new Error(`Reference requires tracked regular file: ${path}`);
    const result = spawnSync('git', ['-C', this.repository, 'show', `${this.base}:${path}`], {
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`Cannot capture reference: ${path}`);
    return {
      path,
      text: result.stdout.toString('utf8'),
      sha256: createHash('sha256').update(result.stdout).digest('hex'),
    };
  }
}
