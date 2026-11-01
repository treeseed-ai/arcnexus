import { RevisionArtifacts } from './revision-artifacts.js';
import { posix } from 'node:path';
import { git } from '../operations/process.js';
import type { ContractDefinition, ReferenceArtifact } from './references.js';
import type { Catalog, Component } from './components.js';
import { relativePath } from './config.js';

const scopePath = (path: string) => (path === '.' ? path : relativePath(path));

export interface ComponentV4Fields {
  testProfile?: string;
  capturedTests?: import('../testing/captured-tests.js').CapturedTest[];
  provides?: ContractDefinition[];
  consumes?: Array<{ id: string; version: string }>;
  patternSnapshots?: Array<{ id: string; artifacts: ReferenceArtifact[] }>;
  providedSnapshots?: Array<ContractDefinition & { owner: string; artifact?: ReferenceArtifact }>;
  contractSnapshots?: Array<ContractDefinition & { owner: string; artifact?: ReferenceArtifact }>;
  repositoryRoot?: string;
  ownership?: {
    paths: string[];
    publicModules: string[];
    directoryExceptions: Array<{ path: string; reason: string }>;
  };
  discovery?: { source: string[]; documentation: string[]; tests: string[]; exclude: string[] };
  coverageExclusions?: Array<{ path: string; reason: string }>;
  patternIds?: string[];
  inventoryAvailability?: 'captured' | 'requires_repository_binding';
  inventory?: Array<{ path: string; kind: string; sha256: string }>;
}

/** Resolves authored package-relative declarations into captured repository paths. */
export class ComponentV4Resolver {
  private files: string[] = [];

  private artifacts?: RevisionArtifacts;

  /** Uses the loaded catalog to resolve package inheritance and leaf authority. */
  constructor(private readonly catalog: Catalog) {}

  /** Resolves captured inputs and rejects unsupported or inconsistent configuration. */
  resolve(): void {
    for (const component of Object.values(this.catalog.components)) {
      if (component.schemaVersion !== 4) continue;
      this.component(component);
    }
    for (const component of Object.values(this.catalog.components)) {
      if (component.schemaVersion === 4 && component.type === 'package') this.members(component);
    }
  }

  /** Finds the containing package without treating containment as write authority. */
  private packageOwner(component: Component): Component | undefined {
    const seen = new Set<string>();
    let current: Component | undefined = component;
    let owner: Component | undefined;
    while (current) {
      if (seen.has(current.id)) throw new Error(`Cyclic component ancestry: ${current.id}`);
      seen.add(current.id);
      if (current.type === 'package') owner = current;
      if (current.parentId && !this.catalog.components[current.parentId])
        throw new Error(`Missing parent: ${current.parentId}`);
      current = current.parentId ? this.catalog.components[current.parentId] : undefined;
    }
    return owner;
  }

  /** Resolves a leaf’s package-relative ownership and effective repository context. */
  private component(component: Component): void {
    if (
      ['platform', 'package'].includes(component.type) &&
      (component.ownership || component.access.writeDirectories.length)
    )
      throw new Error(`Version-four containment nodes cannot own writable paths: ${component.id}`);
    const owner = this.packageOwner(component);
    const root = owner?.repositoryRoot ?? '.';
    scopePath(root);
    if (!['platform', 'package'].includes(component.type) && !owner)
      throw new Error(`Missing package owner: ${component.id}`);
    component.repository = owner?.repository ?? '';
    this.selectRepository(component);
    component.repositoryRoot = root;
    component.patterns = [];
    component.documentation = [];
    component.tests = [];
    component.allowedWritePaths = [];
    component.path = this.path(root, component.path);
    this.permissions(component, root);
    this.inventory(component, root);
  }

  /** Selects the captured repository binding for this package identity. */
  private selectRepository(component: Component): void {
    const revision = this.catalog.repositoryRevisions?.[component.repository];
    component.inventoryAvailability = revision ? 'captured' : 'requires_repository_binding';
    this.artifacts = revision ? new RevisionArtifacts(revision.source, revision.base) : undefined;
    this.files = revision
      ? git(revision.source, 'ls-tree', '-r', '--name-only', revision.base).trim().split('\n')
      : [];
  }

  /** Normalizes a package-relative path before repository-boundary enforcement. */
  private path(root: string, path: string): string {
    scopePath(path);
    const resolved = posix.join(root, path);
    this.artifacts?.validatePath(resolved);
    return resolved;
  }

  /** Resolves package-relative owned paths into effective repository permissions. */
  private permissions(component: Component, root: string): void {
    const ownership = component.ownership;
    if (ownership) {
      ownership.paths = ownership.paths.map((p) => this.path(root, p));
      ownership.publicModules = ownership.publicModules.map((p) => this.path(root, p));
      ownership.directoryExceptions = ownership.directoryExceptions.map((e) => ({
        ...e,
        path: this.path(root, e.path),
      }));
      component.allowedWritePaths = [...ownership.paths];
    }
    component.access = {
      readPaths: component.access.readPaths.map((p) => this.path(root, p)),
      writeDirectories: component.access.writeDirectories.map((p) => this.path(root, p)),
    };
  }

  /** Discovers declared roots at the captured revision and records file hashes. */
  private inventory(component: Component, root: string): void {
    component.inventory = [];
    if (!component.discovery || !this.artifacts) return;
    const excluded = component.discovery.exclude.map((p) => this.path(root, p));
    for (const kind of ['source', 'documentation', 'tests'] as const) {
      const roots = component.discovery[kind].map((p) => this.path(root, p));
      const paths = this.files.filter(
        (p) => roots.some((r) => this.covers(r, p)) && !excluded.some((r) => this.covers(r, p)),
      );
      for (const path of paths) {
        const { sha256 } = this.artifacts!.read(path);
        component.inventory.push({ path, kind, sha256 });
      }
      component.discovery[kind] = roots;
      if (kind !== 'source') component[kind] = roots;
    }
    component.discovery.exclude = excluded;
  }

  /** Tests path containment without treating sibling prefixes as descendants. */
  private covers(root: string, path: string): boolean {
    return root === '.' || root === path || path.startsWith(root + '/');
  }

  /** Derives package membership from authoritative parent relationships. */
  private members(component: Component): void {
    const children = Object.values(this.catalog.components).filter(
      (c) => c.parentId === component.id,
    );
    const ids = (type: string) => children.filter((c) => c.type === type).map((c) => c.id);
    component.members = {
      foundations: ids('foundation'),
      dependencies: [],
      gateways: ids('gateway'),
      libraries: ids('library'),
      releases: ids('release'),
    };
  }
}
