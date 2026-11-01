import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Reconciliation =
  | { status: 'merged'; revision: string }
  | { status: 'conflict'; base: string; current: string; incoming: string; evidence: string };

/** Captures private immutable Git snapshots without changing a source branch or index. */
export class CandidateSnapshots {
  /** Retains the repository object store and private evidence location. */
  constructor(
    private readonly repository: string,
    private readonly directory: string,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  /** Captures tracked and unignored files using a temporary index; preserves the working index. */
  capture(workspace: string, parent: string): string {
    const index = join(this.directory, randomUUID() + '.index');
    const env = { ...process.env, GIT_INDEX_FILE: index };
    try {
      this.git(workspace, ['read-tree', parent], env);
      this.git(workspace, ['add', '-A', '--', '.'], env);
      const tree = this.git(workspace, ['write-tree'], env);
      if (tree === this.git(workspace, ['rev-parse', `${parent}^{tree}`])) return parent;
      return this.commit(tree, [parent]);
    } finally {
      rmSync(index, { force: true });
    }
  }

  /** Reconciles snapshots using an explicit common base and preserves conflict evidence. */
  reconcile(base: string, current: string, incoming: string): Reconciliation {
    const left = this.commit(this.git(this.repository, ['rev-parse', `${current}^{tree}`]), [base]);
    const right = this.commit(this.git(this.repository, ['rev-parse', `${incoming}^{tree}`]), [
      base,
    ]);
    const result = spawnSync(
      'git',
      ['-C', this.repository, 'merge-tree', '--write-tree', left, right],
      { encoding: 'utf8' },
    );
    if (result.status === 0) {
      const tree = result.stdout.split('\n')[0]!;
      return { status: 'merged', revision: this.commit(tree, [current, incoming]) };
    }
    if (result.status !== 1) throw new Error('Snapshot reconciliation failed: ' + result.stderr);
    const evidence = join(this.directory, randomUUID() + '.conflict.txt');
    writeFileSync(evidence, result.stdout + result.stderr, { mode: 0o600 });
    return { status: 'conflict', base, current, incoming, evidence };
  }

  /** Applies an already checked reconciliation to a freshly prepared assignment workspace. */
  apply(workspace: string, current: string, revision: string): void {
    const patch = execFileSync('git', [
      '-C',
      this.repository,
      'diff',
      '--binary',
      current,
      revision,
    ]);
    if (patch.length)
      execFileSync('git', ['-C', workspace, 'apply', '--binary', '-'], { input: patch });
  }

  /** Pins a private commit object so Git maintenance cannot prune retained execution evidence. */
  private commit(tree: string, parents: string[]): string {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'ArcNexus snapshots',
      GIT_AUTHOR_EMAIL: 'snapshots@arcnexus.invalid',
      GIT_COMMITTER_NAME: 'ArcNexus snapshots',
      GIT_COMMITTER_EMAIL: 'snapshots@arcnexus.invalid',
    };
    const id = this.git(
      this.repository,
      [
        'commit-tree',
        tree,
        ...parents.flatMap((p) => ['-p', p]),
        '-m',
        'Private execution snapshot',
      ],
      env,
    );
    this.git(this.repository, ['update-ref', 'refs/arcnexus/snapshots/' + id, id]);
    return id;
  }

  /** Runs Git without shell interpolation and returns its immutable object identity. */
  private git(cwd: string, args: string[], env = process.env): string {
    return execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }).trim();
  }
}
