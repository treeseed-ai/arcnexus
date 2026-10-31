import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '../operations/process.js';
import type { Environment } from '../architecture/config.js';
export function assertOutputs(workspace: string, env: Environment): void {
  if (git(workspace, 'status', '--porcelain', '--untracked-files=all').trim()) throw new Error('Workspace contains changed source or untracked files');
  assertGeneratedOutputs(workspace, env);
}
export function assertGeneratedOutputs(workspace: string, env: Environment): void {
  const ignored = git(workspace, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const path of ignored) if (!env.generatedDirectories.some(dir => path.startsWith(`${dir}/`)) && !env.workspace?.dependencies.some(m=>path===m.path||path.startsWith(m.path+'/'))) throw new Error(`Unknown ignored output: ${path}`);
  for (const path of env.generatedDirectories) {
    const segments = path.split('/');
    for (let i=1; i<=segments.length; i++) {
      const p=join(workspace,...segments.slice(0,i));
      if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`Generated directory is a symlink: ${path}`);
    }
  }
}
