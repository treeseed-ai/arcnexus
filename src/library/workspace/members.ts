import { capturedCommandTimeout } from '../architecture/config.js';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { targetCommand, targetEnvironment, type Bindings } from '../architecture/bindings.js';
import {
  InputError,
  type Command,
  type Dependency,
  type Environment,
} from '../architecture/config.js';
import { execute, git } from '../operations/process.js';
import { assertOutputs } from './outputs.js';
import { save, type RecordData } from './state.js';
export interface Member {
  id: string;
  source: string;
  base: string;
  commonDir: string;
  workspace: string;
  definition: Dependency;
  status: 'pending' | 'created' | 'prepared';
  inventoryDigest?: string;
}
export function memberEnvironment(member: Member): Environment {
  return {
    schemaVersion: 1,
    prerequisites: member.definition.prerequisites,
    setup: member.definition.setup,
    generatedDirectories: member.definition.generatedDirectories,
  };
}
export function resolveMembers(
  source: string,
  base: string,
  workspace: string,
  env: Environment,
  bindings: Bindings,
): Member[] {
  try {
    if (!env.workspace) return [];
    if (git(source, 'remote', 'get-url', 'origin').trim() !== env.workspace.primary.repository)
      throw new InputError('Primary repository origin identity mismatch');
    const resolver = new MemberResolver(source, base, workspace, bindings);
    return env.workspace.dependencies.map((definition) => resolver.resolve(definition));
  } catch (error) {
    throw new InputError(String(error));
  }
}
class MemberResolver {
  constructor(
    private source: string,
    private base: string,
    private workspace: string,
    private bindings: Bindings,
  ) {}
  resolve(definition: Dependency): Member {
    const path = this.sourcePath(definition);
    const pinned = this.revision(path, definition);
    const commonDir = this.commonDirectory(path);
    return {
      id: definition.id,
      source: path,
      base: pinned,
      commonDir,
      workspace: join(this.workspace, definition.path),
      definition,
      status: 'pending' as const,
    };
  }
  private sourcePath(definition: Dependency): string {
    const binding = Object.hasOwn(this.bindings.repositories, definition.id)
      ? this.bindings.repositories[definition.id]
      : undefined;
    if (!binding) throw new InputError(`Missing repository binding: ${definition.id}`);
    const path = realpathSync(git(binding, 'rev-parse', '--show-toplevel').trim());
    if (git(path, 'remote', 'get-url', 'origin').trim() !== definition.repository)
      throw new InputError(`Dependency origin identity mismatch: ${definition.id}`);
    if (git(path, 'status', '--porcelain', '--untracked-files=all').trim())
      throw new InputError(`Dependency source must be clean: ${definition.id}`);
    return path;
  }
  private revision(path: string, definition: Dependency): string {
    const pinned = git(
      path,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${definition.commit}^{commit}`,
    ).trim();
    if (pinned !== definition.commit) throw new InputError('Dependency commit must be immutable');
    if (git(this.source, 'ls-tree', '-r', this.base, '--', definition.path).trim())
      throw new InputError(`Dependency mount contains tracked source: ${definition.path}`);
    return pinned;
  }
  private commonDirectory(path: string): string {
    const commonDir = realpathSync(
      git(path, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    );
    if (
      commonDir ===
      realpathSync(
        git(this.source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
      )
    )
      throw new InputError('Dependency must be an independent repository');
    return commonDir;
  }
}
function checkPath(primary: string, path: string): void {
  let current = primary;
  for (const part of path.split('/')) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || (stat && !stat.isDirectory()))
      throw new Error(`Dependency path is redirected: ${path}`);
  }
}
function registered(member: Member): void {
  if (realpathSync(member.workspace) !== member.workspace)
    throw new Error('Dependency path redirected');
  if (
    realpathSync(
      git(member.workspace, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    ) !== member.commonDir ||
    !git(member.source, 'worktree', 'list', '--porcelain', '-z')
      .split('\0')
      .includes(`worktree ${member.workspace}`)
  )
    throw new Error('Dependency worktree ownership mismatch');
  if (
    git(member.workspace, 'rev-parse', 'HEAD').trim() !== member.base ||
    git(member.workspace, 'branch', '--show-current').trim()
  )
    throw new Error('Dependency identity changed');
}
export function inventory(member: Member): string {
  const hash = createHash('sha256');
  const files = [
    ...new Set([
      ...git(member.workspace, 'ls-files', '-c', '-o', '--exclude-standard', '-z').split('\0'),
      ...git(member.workspace, 'ls-files', '-o', '--ignored', '--exclude-standard', '-z').split(
        '\0',
      ),
    ]),
  ]
    .filter(Boolean)
    .sort();
  for (const file of files) {
    const path = join(member.workspace, file);
    hash.update(file + '\0');
    const stat = lstatSync(path);
    hash.update(String(stat.mode) + '\0');
    hash.update(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}
export function assertMembers(record: RecordData, checkInventory = true): void {
  for (const member of (record.members ?? []) as Member[]) {
    checkPath(record.workspace, member.definition.path);
    registered(member);
    assertOutputs(member.workspace, memberEnvironment(member));
    if (checkInventory && member.inventoryDigest && inventory(member) !== member.inventoryDigest)
      throw new Error(`Read-only dependency changed: ${member.id}`);
  }
}
export async function prepareMembers(
  root: string,
  record: RecordData,
  signal: AbortSignal,
): Promise<void> {
  for (const member of (record.members ?? []) as Member[]) {
    signal.throwIfAborted();
    checkPath(record.workspace, member.definition.path);
    if (existsSync(member.workspace))
      throw new Error(`Dependency mount already exists: ${member.id}`);
    try {
      git(record.workspace, 'check-ignore', '--no-index', member.definition.path + '/');
    } catch {
      throw new InputError(`Dependency mount must be ignored: ${member.definition.path}`);
    }
    save(root, record);
    git(member.source, 'worktree', 'add', '--detach', member.workspace, member.base);
    member.status = 'created';
    save(root, record);
    for (const command of [...member.definition.prerequisites, ...member.definition.setup]) {
      await prepareMemberCommand(root, record, member, command, signal);
    }
    registered(member);
    assertOutputs(member.workspace, memberEnvironment(member));
    member.status = 'prepared';
    save(root, record);
  }
}
async function prepareMemberCommand(
  root: string,
  record: RecordData,
  member: Member,
  command: Command,
  signal: AbortSignal,
): Promise<void> {
  try {
    record.commands.push(
      await execute(
        targetCommand(record, command),
        member.workspace,
        join(root, 'runs', record.id, `command-${record.commands.length}.log`),
        signal,
        { env: targetEnvironment(record), timeoutMs: capturedCommandTimeout(record) },
      ),
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'commandResult' in error)
      record.commands.push(error.commandResult as RecordData['commands'][number]);
    throw error;
  } finally {
    save(root, record);
  }
}
export function freezeMembers(root: string, record: RecordData): void {
  assertMembers(record, false);
  for (const m of (record.members ?? []) as Member[]) m.inventoryDigest = inventory(m);
  save(root, record);
}
export function cleanupMembers(root: string, record: RecordData, validateOnly = false): void {
  const path = join(root, 'runs', record.id, 'members-cleanup.json');
  const removed: string[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).removed : [];
  const members = (record.members ?? []) as Member[];
  // Validate all registrations and inventories before removing any member.
  for (const member of members) validateMemberRemoval(record, member, removed);
  if (validateOnly) return;
  for (const m of [...members].reverse()) {
    if (removed.includes(m.id)) continue;
    if (existsSync(m.workspace)) git(m.source, 'worktree', 'remove', m.workspace);
    removed.push(m.id);
    writeFileSync(path + '.tmp', JSON.stringify({ removed }), { mode: 0o600 });
    renameSync(path + '.tmp', path);
  }
}
function validateMemberRemoval(record: RecordData, m: Member, removed: string[]): void {
  if (removed.includes(m.id)) {
    if (lstatSync(m.workspace, { throwIfNoEntry: false }))
      throw new Error('Removed dependency path is occupied');
    return;
  }
  if (!lstatSync(m.workspace, { throwIfNoEntry: false })) {
    if (
      m.status !== 'pending' &&
      git(m.source, 'worktree', 'list', '--porcelain', '-z')
        .split('\0')
        .includes(`worktree ${m.workspace}`)
    )
      throw new Error('Dependency worktree disappeared');
    return;
  }
  checkPath(record.workspace, m.definition.path);
  registered(m);
  assertOutputs(m.workspace, memberEnvironment(m));
}
