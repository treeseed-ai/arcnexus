import { posix } from 'node:path';
import type { Catalog, Component } from './components.js';
import { ancestry, covered, scopePath } from './component-paths.js';
import { InputError } from './config.js';

export interface ComponentV5Fields {
  operationPlan?: Record<string, import('../operations/operations.js').Operation[]>;
  fileClassification?: import('./file-classification.js').FileClassification[];
  root?: string;
  owns?: string[];
  reads?: string[];
  api?: Array<{ module?: string; export?: string; schema?: string }>;
  operations?: Record<string, string[]>;
  classification?: import('./file-classification.js').FileClassification[];
  policy?: Record<string, { value: unknown; source: string }>;
  director?: { component: string; profile: string };
  reviewerProfile?: string;
  defaultPackage?: string;
  verificationInputs?: string[];
}

/** Resolves policy from original declarations without mutating ancestors during traversal. */
export class ComponentV5Policy {
  /** Keeps an isolated authored catalog for stable inheritance and declaration provenance. */
  constructor(private readonly authored: Catalog) {}

  /** Finds the nearest package and resolves relative paths in their declaring context. */
  root(component: Component): string {
    const owner = ancestry(this.authored, component.id)
      .reverse()
      .find((c) => c.type === 'package');
    const root = owner?.root ?? '.';
    scopePath(root);
    return root;
  }

  /** Anchors and validates a declaration before normalization could hide traversal. */
  path(component: Component, path: string): string {
    scopePath(path);
    return posix.join(this.root(component), path);
  }

  /** Applies nearest scalar policies, narrowed reads and mandatory accumulated intent. */
  apply(component: Component): void {
    const lineage = ancestry(this.authored, component.id);
    component.policy = {};
    for (const key of ['role', 'executionProfile', 'testProfile'] as const) {
      const source = [...lineage].reverse().find((c) => c[key] !== undefined);
      if (!source) continue;
      component[key] = source[key]!;
      component.policy[key] = { value: source[key], source: source.id };
    }
    component.access = { readPaths: this.reads(lineage), writeDirectories: [] };
    for (const key of ['constraints', 'patterns'] as const)
      component[key] = [...new Set(lineage.flatMap((c) => c[key] ?? []))];
    component.operations = {};
    for (const declaration of lineage)
      for (const [id, usages] of Object.entries(declaration.operations ?? {}))
        component.operations[id] = [...new Set([...(component.operations[id] ?? []), ...usages])];
  }

  /** Rejects explicit read expansions while preserving the location of ancestor declarations. */
  private reads(lineage: Component[]): string[] {
    let boundary: string[] | undefined;
    for (const declaration of lineage) {
      if (!declaration.reads) continue;
      const paths = declaration.reads.map((p) => this.path(declaration, p));
      if (boundary && paths.some((p) => !covered(p, boundary!)))
        throw new InputError(`Read policy widens ancestor boundary: ${declaration.id}`);
      boundary = paths;
    }
    return boundary ?? [];
  }
}
