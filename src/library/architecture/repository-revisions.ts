import { resolveMembers } from '../workspace/members.js';
import type { Bindings } from './bindings.js';
import type { Catalog } from './components.js';
import type { Environment } from './config.js';

export interface RepositoryRevision {
  source: string;
  base: string;
}

/** Associates catalog repository identities with captured local revisions. */
export function repositoryRevisions(
  catalog: Catalog,
  environment: Environment,
  source: string,
  base: string,
  bindings?: Bindings,
): void {
  const packages = Object.values(catalog.components).filter((c) => c.type === 'package');
  const identities = [...new Set(packages.map((c) => c.repository))];
  if (!packages.some((c) => c.schemaVersion === 4)) return;
  const primary =
    environment.workspace?.primary.id ?? (identities.length === 1 ? identities[0] : undefined);
  if (!primary)
    throw new Error('Multiple repository packages require an explicit primary repository');
  catalog.primaryRepository = primary;
  catalog.repositoryRevisions = { [primary]: { source, base } };
  if (bindings) {
    for (const member of resolveMembers(source, base, '/workspace', environment, bindings))
      catalog.repositoryRevisions[member.id] = { source: member.source, base: member.base };
  }
}
