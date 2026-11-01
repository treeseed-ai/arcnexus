import { createRequire } from 'node:module';
import { posix } from 'node:path';
import type ts from 'typescript';
import { git } from '../operations/process.js';
import type { Catalog } from './components.js';
import { relativePath } from './config.js';
import { ConfigurationReader, type ConfigurationSource } from './configuration.js';
import { validateSchema } from './schema.js';

interface Owner {
  component: string;
  paths: string[];
  publicModules: string[];
  directoryExceptions: string[];
}

interface OwnershipPolicy {
  schemaVersion: 1;
  maintainedPaths: string[];
  owners: Owner[];
}

const covers = (path: string, root: string) =>
  root === '.' || path === root || path.startsWith(root + '/');

/** Checks project-declared ownership against the captured Git tree. */
export class OwnershipValidator {
  private readonly files = new Set<string>();

  private readonly graph = new Map<string, string[]>();

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private readonly repository: string,
    private readonly base: string,
  ) {}

  /** Rejects inputs that violate the captured configuration contract. */
  validate(catalog: Catalog): ConfigurationSource | undefined {
    const files = git(this.repository, 'ls-tree', '-r', '--name-only', this.base)
      .trim()
      .split('\n');
    files.forEach((file) => this.files.add(file));
    if (Object.values(catalog.components).some((c) => c.schemaVersion === 4)) {
      this.versionFour(catalog, files);
      return;
    }
    if (!files.some((p) => /^architecture\/ownership\.(json|ya?ml)$/.test(p))) return;
    const source = new ConfigurationReader().definition(
      this.repository,
      this.base,
      'architecture/ownership',
    );
    const policy = validateSchema<OwnershipPolicy>('ownership', source.value);
    this.validateOwners(policy, catalog, files);
    for (const file of files.filter((f) => policy.maintainedPaths.some((p) => covers(f, p)))) {
      const owner = this.owner(file, policy);
      if (/\.[cm]?[jt]sx?$/.test(file)) this.imports(file, owner, policy);
    }
    this.assertAcyclic();
    return source;
  }

  /** Derives the v4 ownership index from component declarations. */
  private versionFour(catalog: Catalog, files: string[]): void {
    const components = Object.values(catalog.components).filter(
      (c) => c.type === 'platform' || c.repository === catalog.primaryRepository,
    );
    const owners = components
      .filter((c) => c.ownership)
      .map((c) => ({
        component: c.id,
        paths: c.ownership!.paths,
        publicModules: c.ownership!.publicModules,
        directoryExceptions: c.ownership!.directoryExceptions.map((e) => e.path),
      }));
    const exclusions = components
      .filter((c) => c.type === 'platform')
      .flatMap((c) => c.coverageExclusions ?? []);
    exclusions.forEach((e) => e.path !== '.' && relativePath(e.path));
    const policy: OwnershipPolicy = { schemaVersion: 1, maintainedPaths: ['.'], owners };
    this.validateOwners(policy, catalog, files);
    this.overlaps(owners);
    for (const file of files.filter((p) => !exclusions.some((e) => covers(p, e.path)))) {
      const owner = this.owner(file, policy);
      if (/\.[cm]?[jt]sx?$/.test(file)) this.imports(file, owner, policy);
    }
    this.assertAcyclic();
  }

  /** Rejects ownership roots whose intersection would create competing leaf owners. */
  private overlaps(owners: Owner[]): void {
    for (const owner of owners)
      for (const other of owners) {
        if (owner === other) continue;
        for (const path of owner.paths)
          if (other.paths.some((p) => covers(path, p) || covers(p, path)))
            throw new Error(
              `Overlapping ownership: ${owner.component} / ${other.component}: ${path}`,
            );
      }
  }

  /** Handles owner within this component’s captured contract. */
  private owner(file: string, policy: OwnershipPolicy): Owner {
    const owners = policy.owners.filter((o) => o.paths.some((p) => covers(file, p)));
    if (owners.length !== 1)
      throw new Error(`${file} requires exactly one owner; found ${owners.length}`);
    return owners[0]!;
  }

  /** Checks declared owner paths and directory-granularity exceptions. */
  private validateOwners(policy: OwnershipPolicy, catalog: Catalog, files: string[]): void {
    const identities = new Set<string>();
    for (const owner of policy.owners) {
      const component = catalog.components[owner.component];
      if (!component || identities.has(owner.component))
        throw new Error(`Invalid ownership identity: ${owner.component}`);
      identities.add(owner.component);
      owner.paths.filter((p) => p !== '.').forEach(relativePath);
      owner.publicModules.forEach(relativePath);
      for (const module of owner.publicModules) {
        if (!owner.paths.some((p) => covers(module, p)))
          throw new Error(`Public module outside ownership: ${module}`);
        if (!files.includes(module)) throw new Error(`Missing public module: ${module}`);
      }
      for (const directory of component.access.writeDirectories) {
        if (owner.directoryExceptions.includes(directory)) continue;
        if (!owner.paths.some((p) => covers(directory, p)))
          throw new Error(`Write directory outside ownership: ${owner.component}: ${directory}`);
      }
      for (const writable of component.allowedWritePaths) {
        if (this.owner(writable, policy).component !== owner.component)
          throw new Error(`Writable ownership conflict: ${writable}`);
      }
    }
    this.requireOwners(catalog, identities);
    policy.maintainedPaths.filter((p) => p !== '.').forEach(relativePath);
  }

  /** Requires covered files to resolve to exactly one declared leaf owner. */
  private requireOwners(catalog: Catalog, identities: Set<string>): void {
    for (const component of Object.values(catalog.components)) {
      if (catalog.primaryRepository && component.repository !== catalog.primaryRepository) continue;
      if (!['platform', 'package'].includes(component.type) && !identities.has(component.id))
        throw new Error(`Missing declared owner: ${component.id}`);
    }
  }

  /** Handles imports within this component’s captured contract. */
  private imports(file: string, owner: Owner, policy: OwnershipPolicy): void {
    const text = git(this.repository, 'show', `${this.base}:${file}`);
    const edges: string[] = [];
    for (const entry of moduleReferences(file, text)) {
      const target = this.target(file, entry.specifier);
      if (target) this.checkImport(target, file, owner, policy, edges, entry.typeOnly);
    }
    this.graph.set(file, edges);
  }

  /** Handles target within this component’s captured contract. */
  private target(file: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) return;
    let target = posix.normalize(posix.join(posix.dirname(file), specifier));
    relativePath(target);
    if (target.startsWith('dist/')) target = 'src/' + target.slice(5);
    const candidates = this.moduleCandidates(target);
    return candidates.find((candidate) => this.files.has(candidate));
  }

  /** Enumerates supported TypeScript source counterparts of a module reference. */
  private moduleCandidates(target: string): string[] {
    const extension = posix.extname(target);
    const variants: Record<string, string[]> = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    if (variants[extension])
      return variants[extension]!.map((suffix) => target.slice(0, -extension.length) + suffix);
    if (!extension) return [target + '.ts', target + '.tsx', target + '/index.ts'];
    return /\.[cm]?[jt]sx?$/.test(target) ? [target] : [];
  }

  /** Checks a module reference against its owning component’s public boundary. */
  private checkImport(
    target: string,
    file: string,
    owner: Owner,
    policy: OwnershipPolicy,
    edges: string[],
    typeOnly?: boolean,
  ): void {
    const destination = this.owner(target, policy);
    if (owner.component !== destination.component && !destination.publicModules.includes(target))
      throw new Error(`Private cross-owner import: ${file} -> ${target}`);
    if (!typeOnly) edges.push(target);
  }

  /** Rejects cycles before recursive dependency traversal can proceed. */
  private assertAcyclic(): void {
    const active = new Set<string>(),
      complete = new Set<string>();
    const visit = (file: string): void => {
      if (active.has(file))
        throw new Error(`Runtime import cycle: ${[...active, file].join(' -> ')}`);
      if (complete.has(file)) return;
      active.add(file);
      for (const next of this.graph.get(file) ?? []) visit(next);
      active.delete(file);
      complete.add(file);
    };
    for (const file of this.graph.keys()) visit(file);
  }
}

function moduleReferences(file: string, text: string) {
  const ts: typeof import('typescript') = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const references: Array<{ specifier: string; typeOnly?: boolean }> = [];
  const inspect = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier))
        references.push({
          specifier: specifier.text,
          typeOnly: ts.isExportDeclaration(node) ? node.isTypeOnly : node.importClause?.isTypeOnly,
        });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments[0];
      if (specifier && ts.isStringLiteral(specifier))
        references.push({ specifier: specifier.text, typeOnly: false });
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  return references;
}
