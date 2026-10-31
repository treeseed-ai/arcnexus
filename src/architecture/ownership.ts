import type ts from 'typescript';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { git } from '../operations/process.js';
import { ConfigurationReader, type ConfigurationSource } from './configuration.js';
import { validateSchema } from './schema.js';
import { relativePath } from './config.js';
import type { Catalog } from './components.js';

interface Owner {
  component: string;
  paths: string[];
  publicModules: string[];
  directoryExceptions: string[];
}
interface OwnershipPolicy { schemaVersion: 1; maintainedPaths: string[]; owners: Owner[] }
const covers = (path: string, root: string) => root === '.' || path === root || path.startsWith(root + '/');

/** Checks project-declared ownership against the captured Git tree. */
export class OwnershipValidator {
  private readonly graph = new Map<string, string[]>();
  constructor(private readonly repository: string, private readonly base: string) {}

  validate(catalog: Catalog): ConfigurationSource | undefined {
    const files = git(this.repository, 'ls-tree', '-r', '--name-only', this.base).trim().split('\n');
    if (!files.some(p => /^architecture\/ownership\.(json|ya?ml)$/.test(p))) return;
    const source = new ConfigurationReader().definition(this.repository, this.base, 'architecture/ownership');
    const policy = validateSchema<OwnershipPolicy>('ownership', source.value);
    this.validateOwners(policy, catalog, files);
    for (const file of files.filter(f => policy.maintainedPaths.some(p => covers(f, p)))) {
      const owner = this.owner(file, policy);
      if (/\.[cm]?[jt]sx?$/.test(file)) this.imports(file, owner, policy);
    }
    this.assertAcyclic();
    return source;
  }

  private owner(file: string, policy: OwnershipPolicy): Owner {
    const owners = policy.owners.filter(o => o.paths.some(p => covers(file, p)));
    if (owners.length !== 1) throw new Error(`${file} requires exactly one owner; found ${owners.length}`);
    return owners[0]!;
  }

  private validateOwners(policy: OwnershipPolicy, catalog: Catalog, files: string[]): void {
    const identities = new Set<string>();
    for (const owner of policy.owners) {
      const component = catalog.components[owner.component];
      if (!component || identities.has(owner.component)) throw new Error(`Invalid ownership identity: ${owner.component}`);
      identities.add(owner.component);
      owner.paths.filter(p => p !== '.').forEach(relativePath);
      owner.publicModules.forEach(relativePath);
      for (const module of owner.publicModules) {
        if (!owner.paths.some(p => covers(module, p))) throw new Error(`Public module outside ownership: ${module}`);
        if (!files.includes(module)) throw new Error(`Missing public module: ${module}`);
      }
      for (const directory of component.access.writeDirectories) {
        if (owner.directoryExceptions.includes(directory)) continue;
        if (!owner.paths.some(p => covers(directory, p))) throw new Error(`Write directory outside ownership: ${owner.component}: ${directory}`);
      }
      for (const writable of component.allowedWritePaths) {
        if (this.owner(writable, policy).component !== owner.component) throw new Error(`Writable ownership conflict: ${writable}`);
      }
    }
    for (const component of Object.values(catalog.components)) {
      if (!['platform', 'package'].includes(component.type) && !identities.has(component.id)) throw new Error(`Missing declared owner: ${component.id}`);
    }
    policy.maintainedPaths.filter(p => p !== '.').forEach(relativePath);
  }

  private imports(file: string, owner: Owner, policy: OwnershipPolicy): void {
    const ts: typeof import('typescript') = createRequire(import.meta.url)('typescript');
    const text = git(this.repository, 'show', `${this.base}:${file}`);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const edges: string[] = [];
    const inspect = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (specifier && ts.isStringLiteral(specifier)) {
          const target = this.target(file, specifier.text);
          if (target) this.checkImport(target, file, owner, policy, edges, ts.isExportDeclaration(node) ? node.isTypeOnly : node.importClause?.isTypeOnly);
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteral(specifier)) {
          const target = this.target(file, specifier.text);
          if (target) this.checkImport(target, file, owner, policy, edges, false);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
    this.graph.set(file, edges);
  }

  private target(file: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) return;
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (!target.startsWith('src/')) return;
    return target.replace(/\.js$/, '.ts');
  }

  private checkImport(target: string, file: string, owner: Owner, policy: OwnershipPolicy, edges: string[], typeOnly?: boolean): void {
    const destination = this.owner(target, policy);
    if (owner.component !== destination.component && !destination.publicModules.includes(target)) throw new Error(`Private cross-owner import: ${file} -> ${target}`);
    if (!typeOnly) edges.push(target);
  }

  private assertAcyclic(): void {
    const active = new Set<string>(), complete = new Set<string>();
    const visit = (file: string): void => {
      if (active.has(file)) throw new Error(`Runtime import cycle: ${[...active, file].join(' -> ')}`);
      if (complete.has(file)) return;
      active.add(file);
      for (const next of this.graph.get(file) ?? []) visit(next);
      active.delete(file);
      complete.add(file);
    };
    for (const file of this.graph.keys()) visit(file);
  }
}
