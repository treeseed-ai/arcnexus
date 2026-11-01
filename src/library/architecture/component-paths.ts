import type { Catalog, Component } from './components.js';
import { InputError, relativePath } from './config.js';

export const covered = (path: string, scope: string[]) =>
  scope.some((p) => p === '.' || path === p || path.startsWith(`${p}/`));

export const scopePath = (path: string) => (path === '.' ? path : relativePath(path));

export function ancestry(catalog: Catalog, id: string): Component[] {
  const result: Component[] = [],
    seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw new InputError(`cyclic component ancestry: ${id}`);
    seen.add(id);
    const c = Object.hasOwn(catalog.components, id) ? catalog.components[id] : undefined;
    if (!c) throw new InputError(`Missing component: ${id}`);
    result.unshift(c);
    id = c.parentId ?? '';
  }
  return result;
}
