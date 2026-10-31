import { lstatSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { InputError, relativePath } from './config.js';

export interface AccessPolicy { readPaths: string[]; writeDirectories: string[] }
export interface PreparedPermissions {
  configOverrides: string[];
  tmpDirectory: string;
  createdDirectories: string[];
  filesystem: Record<string, 'read' | 'write'>;
}

function pathList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every(path => typeof path === 'string')) throw new InputError(`Invalid access.${name}`);
  return value.map(path => path === '.' ? path : relativePath(path));
}
export function validateAccess(value: unknown): AccessPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Every component requires access policy');
  const policy = value as Record<string, unknown>;
  if (!('readPaths' in policy) || !('writeDirectories' in policy)) throw new InputError('Every component requires access.readPaths and access.writeDirectories');
  return { readPaths: pathList(policy.readPaths, 'readPaths'), writeDirectories: pathList(policy.writeDirectories, 'writeDirectories') };
}

function inspectSegments(workspace: string, path: string, allowMissing: boolean): { exists: boolean; directory: boolean } {
  let current = workspace;
  let exists = true;
  const parts = path === '.' ? [] : path.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new InputError(`Access path contains symlink: ${path}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new InputError(`Access path parent is not a directory: ${path}`);
      if (index === parts.length - 1) return { exists: true, directory: stat.isDirectory() };
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw new InputError(`Access path does not exist: ${path}`);
      exists = false;
      break;
    }
  }
  return { exists: path === '.' || exists, directory: path === '.' };
}

function covered(path: string, directories: string[]): boolean {
  return directories.some(directory => directory === '.' || path === directory || path.startsWith(`${directory}/`));
}

export function preparePermissions(workspacePath: string, rawAccess: unknown, allowedWritePaths: unknown, tmpDirectory: string, inherited: Array<{ access: unknown; allowedWritePaths: unknown }> = [], readOnlyRoots: string[] = []): PreparedPermissions {
  const workspace = resolve(workspacePath);
  const access = validateAccess(rawAccess);
  const createdDirectories: string[] = [];
  const policies = [...inherited.map(item => ({ access: validateAccess(item.access), writes: item.allowedWritePaths })), { access, writes: allowedWritePaths }];
  for (const policy of policies) {
    if (!Array.isArray(policy.writes) || !policy.writes.every(path => typeof path === 'string')) throw new InputError('Invalid allowedWritePaths');
    const writes = (policy.writes as string[]).map(path => path === '.' ? path : relativePath(path));
    for (const path of writes) if (!covered(path, policy.access.writeDirectories)) throw new InputError(`allowedWritePaths entry is not covered by access.writeDirectories: ${path}`);
    for (const path of policy.access.readPaths) {
      const result = inspectSegments(workspace, path, false);
      if (!result.exists) throw new InputError(`Read path does not exist: ${path}`);
    }
  }
  for (const policy of policies) for (const path of policy.access.writeDirectories) {
    if (path === '.') continue;
    const result = inspectSegments(workspace, path, true);
    const absolute = resolve(workspace, path);
    if (!result.exists) {
      const missing: string[] = [];
      let current = absolute;
      while (relative(workspace, current) !== '' && !inspectAbsolute(current)) { missing.unshift(current); current = dirname(current); }
      for (const directory of missing) { mkdirSync(directory); createdDirectories.push(directory); }
    } else if (!result.directory) throw new InputError(`Write access path is not a directory: ${path}`);
    const checked = inspectSegments(workspace, path, false);
    if (!checked.directory) throw new InputError(`Write access path is not a directory: ${path}`);
  }
  const temp = resolve(tmpDirectory);
  if (temp === workspace || temp.startsWith(`${workspace}${sep}`)) throw new InputError('Private TMPDIR must be outside the worktree');
  mkdirSync(temp, { recursive: true, mode: 0o700 });
  const tmpStat = lstatSync(temp);
  if (!tmpStat.isDirectory() || tmpStat.isSymbolicLink()) throw new InputError('Private TMPDIR must be a real directory');
  const filesystem: Record<string, 'read' | 'write'> = { ':minimal': 'read' };
  for (const path of access.readPaths) filesystem[resolve(workspace, path)] = 'read';
  for (const path of access.writeDirectories) filesystem[path === '.' ? workspace : resolve(workspace, path)] = 'write';
  filesystem[temp] = 'write';
  for(const root of readOnlyRoots){if(!resolve(root).startsWith(workspace+sep))throw new InputError('Dependency permission must be inside primary worktree');filesystem[resolve(root)]='read';}
  const entries = Object.entries(filesystem).map(([path, permission]) => `${JSON.stringify(path)}=${JSON.stringify(permission)}`);
  return {
    configOverrides: [`default_permissions="arcnexus"`, `permissions.arcnexus.filesystem={${entries.join(',')}}`, 'permissions.arcnexus.network.enabled=false'],
    tmpDirectory: temp,
    createdDirectories,
    filesystem,
  };
}

function inspectAbsolute(path: string): boolean {
  try { const stat = lstatSync(path); if (stat.isSymbolicLink()) throw new InputError(`Access path contains symlink: ${path}`); return stat.isDirectory(); }
  catch (error) { if (error instanceof InputError) throw error; if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
