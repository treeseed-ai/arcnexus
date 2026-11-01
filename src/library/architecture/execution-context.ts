import { existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { digest, resolveAssignment, resolveBase, type Assignment } from './assignment.js';
import { loadBindings, type Bindings } from './bindings.js';
import { ancestry, scopePath, loadCatalog, type Catalog, type Component } from './components.js';
import { ConfigurationReader } from './configuration.js';
import { InputError } from './config.js';
import { git } from '../operations/process.js';

export interface ProjectExecution {
  source: string;
  base: string;
  commonDir: string;
  key: string;
  packageId: string;
  owners: string[];
  catalog: Catalog;
  bindings: Bindings;
  directorProfile: string;
  reviewerProfile: string;
  executable: string;
  verificationInputs: string[];
}

/** Resolves package context and frozen execution defaults from the current directory. */
export class ExecutionContext {
  /** Discovers repository, committed authority and machine bindings; ambiguous packages fail. */
  resolve(cwd: string): ProjectExecution {
    const { source, base } = resolveBase(cwd);
    const commonDir = realpathSync(
      git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    );
    const path = join(commonDir, 'arcnexus', 'bindings.yaml');
    const bindings = loadBindings(existsSync(path) ? path : undefined);
    const catalog = loadCatalog(source, base, bindings);
    const config = this.defaults(source, base);
    const selected = this.package(catalog, relative(source, resolve(cwd)), config.defaultPackage);
    const owners = this.owners(catalog, selected.id);
    this.profiles(catalog, [
      ...owners.map((id) => catalog.components[id]!.executionProfile),
      config.directorProfile,
      config.reviewerProfile,
    ]);
    return {
      source,
      base,
      commonDir,
      key: digest(commonDir).slice(0, 24),
      packageId: selected.id,
      owners,
      catalog,
      bindings,
      ...config,
      executable: bindings.tools.codex ?? 'codex',
    };
  }

  /** Selects executable descendants while containers contribute inherited context only. */
  private owners(catalog: Catalog, packageId: string): string[] {
    const owners = Object.values(catalog.components)
      .filter(
        (c) =>
          !['package', 'platform'].includes(c.type) &&
          c.verification.length &&
          ancestry(catalog, c.id).some((parent) => parent.id === packageId),
      )
      .map((c) => c.id);
    return owners;
  }

  /** Resolves an assignment solely against the source authority captured for the run. */
  assignment(context: ProjectExecution, owner: string, value: Assignment, profile?: string) {
    if (!context.owners.includes(owner)) throw new InputError('Owner is outside captured package');
    return resolveAssignment(context.source, context.base, owner, {
      value,
      capturedCatalog: context.catalog,
      bindings: context.bindings,
      executionProfile: profile,
    });
  }

  /** Reads declarative director/reviewer profiles without selecting models in scheduling code. */
  private defaults(source: string, base: string) {
    const value = new ConfigurationReader().definition(source, base, 'architecture/execution')
      .value as Record<string, unknown>;
    if (typeof value.directorProfile !== 'string' || typeof value.reviewerProfile !== 'string')
      throw new InputError(
        'architecture/execution.yaml must declare directorProfile and reviewerProfile',
      );
    if (value.verificationInputs !== undefined && !Array.isArray(value.verificationInputs))
      throw new InputError('verificationInputs must be an array of captured source paths');
    return {
      verificationInputs: ((value.verificationInputs ?? []) as string[]).map(scopePath),
      directorProfile: value.directorProfile,
      reviewerProfile: value.reviewerProfile,
      defaultPackage: typeof value.defaultPackage === 'string' ? value.defaultPackage : undefined,
    };
  }

  /** Selects the deepest containing package; equal candidates require an explicit default. */
  private package(catalog: Catalog, path: string, defaultId?: string): Component {
    const packages = Object.values(catalog.components).filter(
      (c) =>
        c.type === 'package' &&
        (c.path === '.' || path === c.path || path.startsWith(c.path + '/')),
    );
    const depth = (c: Component) => (c.path === '.' ? 0 : c.path.split('/').length);
    const maximum = Math.max(...packages.map(depth));
    const selected = packages.filter((c) => depth(c) === maximum);
    if (selected.length === 1) return selected[0]!;
    const fallback = selected.find((c) => c.id === defaultId);
    if (fallback) return fallback;
    throw new InputError(
      'Ambiguous or missing package; declare defaultPackage in architecture/execution.yaml',
    );
  }

  /** Rejects obsolete work budgets rather than silently changing their meaning. */
  private profiles(catalog: Catalog, ids: string[]): void {
    const obsolete = [
      'timeoutSeconds',
      'commandTimeoutSeconds',
      'maxOperationCalls',
      'maxTurns',
      'maxCorrectiveTurns',
      'maxChecklistCalls',
      'maxAttempts',
    ];
    for (const id of ids) {
      const profile = catalog.profiles[id];
      if (!profile) throw new InputError('Unknown execution profile: ' + id);
      if (profile.schemaVersion < 2)
        throw new InputError(
          `Migrate profile ${id} to a planned execution schema (version 2 or 3)`,
        );
      for (const key of obsolete)
        if (Object.hasOwn(profile, key))
          throw new InputError(`Remove obsolete work budget ${key} from profile ${id}`);
    }
  }
}
