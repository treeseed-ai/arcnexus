import type { Component } from './components.js';
import { covered, scopePath } from './component-paths.js';
import { InputError } from './config.js';

export interface FileClassification {
  path: string;
  kind: 'source' | 'documentation' | 'tests' | 'unknown';
}

/** Classifies an existing or proposed path against the same captured rules. */
export function classifyComponentPath(component: Component, path: string): string {
  scopePath(path);
  if (!covered(path, component.allowedWritePaths))
    throw new InputError(`Cannot classify outside component ownership: ${path}`);
  const matches = (component.fileClassification ?? []).filter((r) => covered(path, [r.path]));
  if (new Set(matches.map((r) => r.kind)).size > 1)
    throw new InputError(`Conflicting file classifications: ${path}`);
  if (matches.length) return matches[0]!.kind;
  if (/\.(md|mdx|rst)$/i.test(path)) return 'documentation';
  if (/(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) return 'tests';
  return /\.[cm]?[jt]sx?$/.test(path) ? 'source' : 'unknown';
}

/** Rejects contradictory rules even when their overlap contains no tracked files yet. */
export function validateClassifications(rules: FileClassification[]): void {
  for (const rule of rules) {
    scopePath(rule.path);
    for (const other of rules)
      if (
        rule.kind !== other.kind &&
        (covered(rule.path, [other.path]) || covered(other.path, [rule.path]))
      )
        throw new InputError(`Conflicting file classifications: ${rule.path} / ${other.path}`);
  }
}
