import { ancestry, covered, scopePath } from './component-paths.js';
import { ComponentV5Resolver } from './component-v5.js';
import type { ComponentV5Fields } from './component-v5-policy.js';
import { captureComponentTests } from '../testing/captured-tests.js';
import { repositoryRevisions, type RepositoryRevision } from './repository-revisions.js';
import type { Bindings } from './bindings.js';
import { ComponentV4Resolver, type ComponentV4Fields } from './component-v4.js';
import { ArchitectureReferences } from './references.js';
import { validateInitialization } from './initialization.js';
import type { Operation } from '../operations/operations.js';
import { git } from '../operations/process.js';
import { commands, environment, InputError, type Command, type Environment } from './config.js';
import { ConfigurationReader, isConfiguration, type ConfigurationSource } from './configuration.js';
import { DirectoryGrants } from './directory-grants.js';
import { OwnershipValidator } from './ownership.js';
import { validateAccess, type AccessPolicy } from './permissions.js';
import { validateSchema } from './schema.js';

export { ancestry, covered, scopePath } from './component-paths.js';

export { classifyComponentPath } from './file-classification.js';

export interface Component extends ComponentV4Fields, ComponentV5Fields {
  initialization?: { schemaVersion: 3; componentId: string };
  schemaVersion: 1 | 2 | 3 | 4 | 5;
  operationIds?: string[];
  id: string;
  type: string;
  repository: string;
  purpose: string;
  path: string;
  objectives: string[];
  constraints: string[];
  access: AccessPolicy;
  allowedWritePaths: string[];
  verification: Command[];
  parentId?: string;
  questions: string[];
  patterns: string[];
  interfaces: string[];
  documentation: string[];
  tests: string[];
  relatedIds: string[];
  role: string;
  executionProfile: string;
  members?: {
    foundations: string[];
    dependencies: string[];
    gateways: string[];
    libraries: string[];
    releases: string[];
  };
}

export interface Role {
  schemaVersion: 1 | 3;
  id: string;
  purpose: string;
  responsibilities: string[];
  activities: string[];
}

export interface ExecutionProfile {
  schemaVersion: 1 | 2 | 3;
  id: string;
  model: string;
  reasoning: 'low' | 'medium' | 'high';
  webSearch: 'live' | 'disabled';
  timeoutSeconds?: number;
  commandTimeoutSeconds?: number;
  operationCategories?: string[];
  maxOperationCalls?: number;
  maxTurns?: number;
  maxCorrectiveTurns?: number;
  maxChecklistCalls?: number;
  maxAttempts?: number;
}

export interface CompositionProfile {
  schemaVersion: 1 | 3;
  id: string;
  platformId: string;
  packageIds: string[];
}

export interface Catalog {
  primaryRepository?: string;
  repositoryRevisions?: Record<string, RepositoryRevision>;
  configurationSources: ConfigurationSource[];
  operations: Record<string, Operation>;
  compositions: Record<string, CompositionProfile>;
  components: Record<string, Component>;
  roles: Record<string, Role>;
  profiles: Record<string, ExecutionProfile>;
}

export function validateOperations(
  operations: Operation[],
  profile: ExecutionProfile,
  env: Environment,
): void {
  for (const op of operations) {
    if (profile.schemaVersion < 2 || !profile.operationCategories?.includes(op.category))
      throw new InputError('Operation category not permitted by execution profile: ' + op.id);
    for (const path of op.generatedDirectories)
      if (!env.generatedDirectories.includes(path))
        throw new InputError('Operation generated directory is not declared disposable: ' + path);
    if (
      op.kind === 'http' &&
      !operations.some((service) => service.id === op.http.serviceId && service.kind === 'service')
    )
      throw new InputError('HTTP operation requires a declared service in assignment scope');
  }
}

function read<T>(
  repository: string,
  base: string,
  path: string,
  schema: string,
  sources: ConfigurationSource[],
): T {
  const source = new ConfigurationReader().revision(repository, base, path);
  sources.push(source);
  try {
    const version = (source.value as { schemaVersion?: number }).schemaVersion;
    return validateSchema<T>(
      schema === 'component' && (version === 4 || version === 5) ? `component-v${version}` : schema,
      source.value,
    );
  } catch (error) {
    throw new InputError(`${path}: ${String(error)}`);
  }
}

export function loadCatalog(repository: string, base: string, bindings?: Bindings): Catalog {
  try {
    return new CatalogLoader(repository, base, bindings).load();
  } catch (error) {
    throw new InputError(String(error));
  }
}

/** Loads revision-pinned definitions and resolves their cross-component references. */
class CatalogLoader {
  readonly catalog: Catalog = {
    configurationSources: [],
    operations: {},
    compositions: {},
    components: {},
    roles: {},
    profiles: {},
  };

  private readonly paths: string[];

  /** Inventories architecture files at the fixed Git revision without reading candidate edits. */
  constructor(
    private readonly repository: string,
    private readonly base: string,
    private readonly bindings?: Bindings,
  ) {
    this.paths = git(repository, 'ls-tree', '-r', '--name-only', base, '--', 'architecture')
      .split('\n')
      .sort();
  }

  /** Loads all catalog definitions before validating cross-references. */
  load(): Catalog {
    this.definitions();
    for (const path of this.files('operations')) this.operation(path);
    const source = new ConfigurationReader().definition(
      this.repository,
      this.base,
      'architecture/environment',
    );
    this.catalog.configurationSources.push(source);
    const env = environment(source.value);
    repositoryRevisions(this.catalog, env, this.repository, this.base, this.bindings);
    new ComponentV4Resolver(this.catalog).resolve();
    new ComponentV5Resolver(this.catalog).resolve();
    if (!Object.keys(this.catalog.components).length) throw new InputError('No components defined');
    const validator = new CatalogComponentValidator(this.catalog, env);
    for (const component of Object.values(this.catalog.components)) validator.validate(component);
    validateInitialization(this.catalog);
    captureComponentTests(this.catalog, this.repository, this.base);
    new ArchitectureReferences(this.repository, this.base, this.catalog).resolve();
    for (const path of this.files('composition-profiles')) this.composition(path);
    this.ownership();
    return this.catalog;
  }

  /** Validates physical grants and exact maintained-source ownership after resolution. */
  private ownership(): void {
    const grants = new DirectoryGrants(this.repository, this.base);
    for (const component of Object.values(this.catalog.components))
      if (
        !this.catalog.primaryRepository ||
        component.repository === this.catalog.primaryRepository
      )
        grants.validate(component);
    const ownership = new OwnershipValidator(this.repository, this.base).validate(this.catalog);
    if (ownership) this.catalog.configurationSources.push(ownership);
  }

  /** Enumerates supported definition files in the captured repository revision. */
  private files(directory: string): string[] {
    return this.paths.filter(
      (path) => path.startsWith(`architecture/${directory}/`) && isConfiguration(path),
    );
  }

  /** Parses and schema-validates each declared catalog definition. */
  private definitions(): void {
    const { catalog, repository, base, paths } = this;
    const groups = [
      ['components', 'component', catalog.components],
      ['roles', 'role', catalog.roles],
      ['execution-profiles', 'execution-profile', catalog.profiles],
    ] as const;
    for (const [directory, schema, target] of groups)
      for (const path of paths.filter(
        (p) => p.startsWith(`architecture/${directory}/`) && isConfiguration(p),
      )) {
        const value = read<Component & Role & ExecutionProfile>(
          repository,
          base,
          path,
          schema,
          catalog.configurationSources,
        );
        if (
          Number(value.schemaVersion) !== 5 &&
          path.replace(/\.(json|ya?ml)$/, '') !== `architecture/${directory}/${value.id}`
        )
          throw new InputError(`Identity must match filename: ${path}`);
        if (Object.hasOwn(target, value.id))
          throw new InputError(`Duplicate definition: ${value.id}`);
        Object.defineProperty(target, value.id, { value, enumerable: true, configurable: true });
      }
  }

  /** Loads a referenced operation without granting it to unrelated owners. */
  private operation(path: string): void {
    const { catalog, repository, base } = this;
    const operation = read<Operation>(
      repository,
      base,
      path,
      'operation',
      catalog.configurationSources,
    );
    if (path.replace(/\.(json|ya?ml)$/, '') !== `architecture/operations/${operation.id}`)
      throw new InputError('Operation identity must match filename');
    scopePath(operation.cwd);
    operation.generatedDirectories.forEach(scopePath);
    operation.artifacts.forEach(scopePath);
    commands([...(operation.kind === 'http' ? [] : [operation]), ...operation.probes]);
    if (Object.hasOwn(catalog.operations, operation.id))
      throw new InputError('Duplicate operation: ' + operation.id);
    Object.defineProperty(catalog.operations, operation.id, {
      value: operation,
      enumerable: true,
    });
  }

  /** Resolves declared package selection independently of ownership parents. */
  private composition(path: string): void {
    const { catalog, repository, base } = this;
    const profile = read<CompositionProfile>(
      repository,
      base,
      path,
      'composition-profile',
      catalog.configurationSources,
    );
    if (
      path.replace(/\.(json|ya?ml)$/, '') !== `architecture/composition-profiles/${profile.id}` ||
      catalog.components[profile.platformId]?.type !== 'platform'
    )
      throw new InputError('Invalid composition platform');
    if (Object.hasOwn(catalog.compositions, profile.id))
      throw new InputError('Duplicate composition: ' + profile.id);
    Object.defineProperty(catalog.compositions, profile.id, { value: profile, enumerable: true });
    for (const id of profile.packageIds)
      if (
        catalog.components[id]?.type !== 'package' ||
        catalog.components[id]?.parentId !== profile.platformId
      )
        throw new InputError(`Invalid composition package: ${id}`);
  }
}

/** Checks catalog relationships, scopes and operation compatibility before inference. */
class CatalogComponentValidator {
  /** Retains the resolved catalog and environment for cross-definition compatibility checks. */
  constructor(
    private readonly catalog: Catalog,
    private readonly env: Environment,
  ) {}

  /** Rejects inputs that violate the captured configuration contract. */
  validate(c: Component): void {
    this.paths(c);
    this.operations(c);
    this.ancestors(c);
    this.related(c);
    this.members(c);
  }

  /** Validates the component’s paths before they can become execution scope. */
  private paths(c: Component): void {
    scopePath(c.path);
    validateAccess(c.access);
    for (const p of [...c.allowedWritePaths, ...c.documentation, ...c.tests]) scopePath(p);
    commands(c.verification);
    if (
      c.schemaVersion !== 5 &&
      c.allowedWritePaths.some((p) => !covered(p, c.access.writeDirectories))
    )
      throw new InputError(`Uncovered writable scope: ${c.id}`);
  }

  /** Checks referenced operations against the component profile and environment. */
  private operations(c: Component): void {
    const { catalog, env } = this;
    if (c.schemaVersion === 5 && ['platform', 'package'].includes(c.type)) return;
    const ids = c.schemaVersion === 5 ? Object.keys(c.operations ?? {}) : (c.operationIds ?? []);
    for (const id of ids) {
      const op = catalog.operations[id];
      if (!Object.hasOwn(catalog.operations, id) || op?.repository !== c.repository)
        throw new InputError('Missing operation or conflicting repository owner: ' + id);
      if (!op.activities.every((a) => catalog.roles[c.role]?.activities.includes(a)))
        throw new InputError('Operation activity outside role');
    }
    if (
      !Object.hasOwn(catalog.roles, c.role) ||
      !Object.hasOwn(catalog.profiles, c.executionProfile)
    )
      throw new InputError(`Missing role/execution profile for ${c.id}`);
    validateOperations(
      ids.map((id) => catalog.operations[id]!),
      catalog.profiles[c.executionProfile]!,
      env,
    );
  }

  /** Checks inherited constraints across the complete parent chain. */
  private ancestors(c: Component): void {
    const { catalog } = this;
    const ancestors = ancestry(catalog, c.id).slice(0, -1);
    const parent = ancestors.at(-1);
    if (c.type === 'platform' && parent) throw new InputError('Platform cannot have an owner');
    if (parent && c.type === 'package' && parent.type !== 'platform')
      throw new InputError('Package owner must be a platform');
    if (parent && c.type !== 'package' && c.repository !== parent.repository)
      throw new InputError(`Conflicting repository ownership: ${c.id}`);
    for (const a of ancestors.filter((a) => a.repository === c.repository)) {
      if (
        a.schemaVersion >= 3 &&
        ['platform', 'package'].includes(a.type) &&
        !a.allowedWritePaths.length &&
        !a.access.writeDirectories.length
      )
        continue;
      if (
        c.allowedWritePaths.some((p) => !covered(p, a.allowedWritePaths)) ||
        c.access.writeDirectories.some((p) => !covered(p, a.access.writeDirectories))
      )
        throw new InputError(`Child widens ancestor authority: ${c.id}`);
    }
  }

  /** Validates context relationships without adding write authority. */
  private related(c: Component): void {
    const { catalog } = this;
    for (const id of c.relatedIds)
      if (!Object.hasOwn(catalog.components, id))
        throw new InputError(`Missing related component: ${id}`);
    if (c.type === 'package' && !c.members)
      throw new InputError(`Package requires member declarations: ${c.id}`);
  }

  /** Checks package membership and referenced component identities. */
  private members(c: Component): void {
    const { catalog } = this;
    if (c.members) {
      if (c.type !== 'package') throw new InputError('Only packages declare members');
      for (const [kind, ids] of Object.entries(c.members))
        for (const id of ids) {
          const member = Object.hasOwn(catalog.components, id) ? catalog.components[id] : undefined;
          if (
            !member ||
            (kind !== 'dependencies' && member.parentId !== c.id) ||
            (['foundations', 'gateways', 'libraries'].includes(kind) &&
              member.type !==
                (
                  {
                    foundations: 'foundation',
                    gateways: 'gateway',
                    libraries: 'library',
                  } as Record<string, string>
                )[kind])
          )
            throw new InputError(`Invalid ${kind} member: ${id}`);
        }
    }
  }
}

export function loadContext(repository: string, base: string, id: string): Component[] {
  return ancestry(loadCatalog(repository, base), id);
}
