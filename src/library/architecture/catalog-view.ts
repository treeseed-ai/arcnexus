import type { Catalog, Component } from './components.js';

/** Projects captured responsibility without duplicating source text or granting authority. */
export function catalogView(catalog: Catalog) {
  const components = Object.values(catalog.components);
  return {
    components: components.map((component) => component.id),
    owners: Object.fromEntries(
      components
        .filter((component) => !['platform', 'package'].includes(component.type))
        .map((component) => [component.id, ownerView(component)]),
    ),
    packages: components
      .filter((component) => component.type === 'package')
      .map((component) => ({
        id: component.id,
        repository: component.repository,
        root: component.repositoryRoot ?? null,
        members: component.members,
      })),
    coverageExclusions: components.flatMap((component) => component.coverageExclusions ?? []),
    validation: 'static',
    requiresPreparedEnvironment: [
      'prerequisites',
      'setup',
      'capability probes',
      'baseline verification',
    ],
  };
}

/** Keeps ownership, write scope, sandbox grants and captured inventories visibly distinct. */
function ownerView(component: Component) {
  return {
    type: component.type,
    policy: component.policy,
    repository: component.repository,
    packageRoot: component.repositoryRoot ?? null,
    ownershipBasis: component.ownership ? 'component-definition' : 'legacy-write-scope-only',
    ownedPaths: component.ownership?.paths ?? null,
    writeScope: component.allowedWritePaths,
    directoryGrants: component.access.writeDirectories,
    directoryExceptions: component.ownership?.directoryExceptions ?? [],
    publicModules: component.ownership?.publicModules ?? [],
    inventory: component.inventory ?? null,
    inventoryAvailability: component.inventoryAvailability ?? 'legacy',
    patterns:
      component.patternSnapshots?.map((pattern) => ({
        id: pattern.id,
        artifacts: pattern.artifacts.map(({ path, sha256 }) => ({ path, sha256 })),
      })) ?? [],
    provides:
      component.providedSnapshots?.map(({ artifact: _artifact, ...contract }) => contract) ?? [],
    consumes:
      component.contractSnapshots?.map(({ artifact: _artifact, ...contract }) => contract) ?? [],
    testProfile: component.testProfile ?? null,
    capturedTests: component.capturedTests ?? [],
  };
}
