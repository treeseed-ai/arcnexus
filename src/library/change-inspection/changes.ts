import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { relativePath } from '../architecture/config.js';
import { git } from '../operations/process.js';
import type { RecordData } from '../workspace/state.js';

export interface Change {
  path: string;
  kind: string;
}

function diffChanges(workspace: string, ...args: string[]): Change[] {
  const entries = git(workspace, ...args).split('\0');
  const result: Change[] = [];
  for (let i = 0; i < entries.length - 1; i += 2)
    result.push({ kind: entries[i]!, path: entries[i + 1]! });
  return result;
}

export function changes(record: RecordData): Change[] {
  const staged = diffChanges(
    record.workspace,
    'diff',
    '--cached',
    '--name-status',
    '--no-renames',
    '-z',
    record.base,
    '--',
  );
  const unstaged = diffChanges(
    record.workspace,
    'diff',
    '--name-status',
    '--no-renames',
    '-z',
    '--',
  );
  const untracked = git(record.workspace, 'ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ path, kind: '?' }));
  record.stagedChanges = staged;
  record.unstagedChanges = unstaged;
  const byPath = new Map<string, Change>();
  for (const change of [...unstaged, ...staged, ...untracked])
    if (!byPath.has(change.path)) byPath.set(change.path, change);
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function checkScope(workspace: string, observed: Change[], allowed: string[]): void {
  for (const change of observed) {
    relativePath(change.path);
    if (!allowed.some((p) => p === '.' || change.path === p || change.path.startsWith(`${p}/`)))
      throw new Error(`Out-of-scope change: ${change.path}`);
    const indexEntries = git(workspace, 'ls-files', '--stage', '-z', '--', change.path).split('\0');
    if (indexEntries.some((entry) => entry.startsWith('120000 ')))
      throw new Error(`Symlink change is unsupported: ${change.path}`);
    const parts = change.path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = join(workspace, ...parts.slice(0, i));
      try {
        if (lstatSync(p).isSymbolicLink())
          throw new Error(`Symlink change is unsupported: ${change.path}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

export function captureChanges(root: string, record: RecordData): void {
  if (!existsSync(join(record.workspace, '.git'))) return;
  const observed = changes(record);
  record.changes = observed;
  record.reviewPaths = observed
    .filter((c) => /(^|\/)(tests?|AGENTS\.md|SKILL\.md)(\/|$)|\.test\./.test(c.path))
    .map((c) => c.path);
  const dir = join(root, 'runs', record.id);
  writeFileSync(
    join(dir, 'changes.patch'),
    git(record.workspace, 'diff', '--binary', '--no-ext-diff', record.base, '--'),
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, 'staged.patch'),
    git(record.workspace, 'diff', '--cached', '--binary', '--no-ext-diff', record.base, '--'),
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, 'unstaged.patch'),
    git(record.workspace, 'diff', '--binary', '--no-ext-diff', '--'),
    { mode: 0o600 },
  );
  const added = captureNewFiles(record.workspace, observed);
  writeFileSync(join(dir, 'new-files.json'), JSON.stringify(added, null, 2) + '\n', {
    mode: 0o600,
  });
}

function captureNewFiles(workspace: string, observed: Change[]): Record<string, string> {
  const added: Record<string, string> = {};
  for (const c of observed.filter((c) => c.kind === '?')) {
    // Do not follow symlinks when collecting evidence, including parent directories.
    try {
      checkScope(workspace, [c], [c.path]);
      if (lstatSync(join(workspace, c.path)).isFile())
        added[c.path] = readFileSync(join(workspace, c.path)).toString('base64');
    } catch {}
  }
  return added;
}

/** Source/test bytes can distinguish actions; prose and checklist claims cannot. */
export function materialCandidate(record: RecordData): string {
  const context = record.context as Array<{ documentation?: string[] }> | undefined;
  const documentation = context?.at(-1)?.documentation ?? [];
  const selected = changes(record).filter(
    (change) =>
      !/\.(md|mdx|rst)$/i.test(change.path) &&
      !documentation.some((path) => change.path === path || change.path.startsWith(path + '/')),
  );
  checkScope(
    record.workspace,
    selected,
    selected.map((change) => change.path),
  );
  return JSON.stringify(
    selected.map((change) => ({
      ...change,
      bytes: existsSync(join(record.workspace, change.path))
        ? readFileSync(join(record.workspace, change.path)).toString('base64')
        : null,
    })),
  );
}

export function candidateDigest(record: RecordData): string {
  const observed = changes(record);
  checkScope(
    record.workspace,
    observed,
    observed.map((c) => c.path),
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        index: git(record.workspace, 'diff', '--cached', '--binary', record.base, '--'),
        working: git(record.workspace, 'diff', '--binary', '--'),
        files: observed.map((c) => ({
          path: c.path,
          bytes: existsSync(join(record.workspace, c.path))
            ? readFileSync(join(record.workspace, c.path)).toString('base64')
            : null,
        })),
      }),
    )
    .digest('hex');
}
