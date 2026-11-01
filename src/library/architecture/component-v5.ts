import { git } from '../operations/process.js';
import type { Catalog, Component } from './components.js';
import { ancestry, covered } from './component-paths.js';
import { ComponentV5Policy } from './component-v5-policy.js';
import { RevisionArtifacts } from './revision-artifacts.js';
import { InputError } from './config.js';

/** Materializes effective v5 components from immutable authored intent and captured source. */
export class ComponentV5Resolver {
  private readonly authored: Catalog;

  private readonly policy: ComponentV5Policy;

  /** Captures declarations before derived fields are added to the runtime catalog. */
  constructor(private readonly catalog: Catalog) {
    this.authored = structuredClone(catalog);
    this.policy = new ComponentV5Policy(this.authored);
  }

  /** Resolves all v5 definitions and derives package membership from parent identity. */
  resolve(): void {
    for (const component of Object.values(this.catalog.components)) {
      if (component.schemaVersion !== 5) continue;
      this.component(component);
      if (component.type === 'package') this.members(component);
    }
  }

  /** Resolves location and policy without assigning descendant ownership to containers. */
  private component(c: Component): void {
    const lineage = ancestry(this.authored, c.id);
    const owner = [...lineage].reverse().find((a) => a.type === 'package');
    if (!owner && c.type !== 'platform') throw new InputError(`Missing package owner: ${c.id}`);
    c.repository = owner?.repository ?? this.catalog.primaryRepository!;
    c.repositoryRoot = this.policy.root(c);
    c.path = c.repositoryRoot;
    this.policy.apply(c);
    c.objectives ??= [];
    c.questions ??= [];
    c.relatedIds = [];
    c.interfaces = [];
    c.verification = [];
    c.documentation = [];
    c.tests = [];
    c.allowedWritePaths = [];
    if (!['platform', 'package'].includes(c.type)) this.owner(c);
  }

  /** Adds implicit definition ownership and resolves intentional public entry points. */
  private owner(c: Component): void {
    const definition = this.catalog.configurationSources.find(
      (s) => (s.value as Component).id === c.id && s.path.startsWith('architecture/components/'),
    );
    if (!definition) throw new InputError(`Missing component definition: ${c.id}`);
    const paths = (c.owns ?? []).map((p) => this.policy.path(c, p));
    if (covered(definition.path, paths))
      throw new InputError(`Definition ownership is implicit; remove duplicate owns path: ${c.id}`);
    paths.push(definition.path);
    c.api = (c.api ?? []).map((entry) => ({
      ...entry,
      ...(entry.module ? { module: this.policy.path(c, entry.module) } : {}),
      ...(entry.schema ? { schema: this.policy.path(c, entry.schema) } : {}),
    }));
    c.ownership = {
      paths,
      publicModules: c.api.flatMap((a) => (a.module ? [a.module] : [])),
      directoryExceptions: [],
    };
    c.allowedWritePaths = [...paths];
    c.access.readPaths = [...new Set([...c.access.readPaths, ...paths])];
    this.inventory(c);
  }

  /** Captures exact owned file hashes, leaving unknown artifacts visible and owned. */
  private inventory(c: Component): void {
    const revision = this.catalog.repositoryRevisions?.[c.repository];
    c.inventoryAvailability = revision ? 'captured' : 'requires_repository_binding';
    c.inventory = [];
    if (!revision) return;
    const artifacts = new RevisionArtifacts(revision.source, revision.base);
    c.allowedWritePaths.forEach((p) => artifacts.validatePath(p));
    const files = git(revision.source, 'ls-tree', '-r', '--name-only', revision.base).split('\n');
    for (const path of files.filter((p) => covered(p, c.allowedWritePaths))) {
      const kind = this.classify(c, path);
      c.inventory.push({ path, kind, sha256: artifacts.read(path).sha256 });
      if (kind === 'documentation' || kind === 'tests') c[kind].push(path);
    }
  }

  /** Uses one path classifier for captured artifacts; exceptional rules cannot conflict. */
  private classify(c: Component, path: string): string {
    const owner = ancestry(this.authored, c.id)
      .reverse()
      .find((a) => a.type === 'package')!;
    const matches = (owner.classification ?? []).filter((r) =>
      covered(path, [this.policy.path(owner, r.path)]),
    );
    if (new Set(matches.map((r) => r.kind)).size > 1)
      throw new InputError(`Conflicting file classifications: ${path}`);
    if (matches.length) return matches[0]!.kind;
    if (/\.(md|mdx|rst)$/i.test(path)) return 'documentation';
    if (/(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) return 'tests';
    return /\.[cm]?[jt]sx?$/.test(path) ? 'source' : 'unknown';
  }

  /** Derives direct executable members without a separately maintained inventory. */
  private members(c: Component): void {
    const children = Object.values(this.catalog.components).filter(
      (child) => child.parentId === c.id,
    );
    const ids = (type: string) =>
      children.filter((child) => child.type === type).map((child) => child.id);
    c.members = {
      foundations: ids('foundation'),
      gateways: ids('gateway'),
      libraries: ids('library'),
      releases: ids('release'),
      dependencies: [],
    };
  }
}
