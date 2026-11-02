import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { InputError } from '../architecture/config.js';
import { classifyComponentPath, type Component } from '../architecture/components.js';
import { SuiteMetadataReader } from './metadata.js';
import type { SuiteMetadata } from './suite.js';
import { compiledTestPath } from './captured-tests.js';

export interface TestFilters {
  component?: string;
  level?: string;
  category?: string;
  tags?: string[];
}

export interface DiscoveredSuite extends SuiteMetadata {
  source: string;
  profile: string;
  compiled: string;
  category: string;
  sha256: string;
  state: 'unchanged' | 'modified' | 'added';
}

/** Discovers current checkout suites within captured, owner-declared test roots. */
export class TestDiscovery {
  /** Selects the checkout to inventory without executing its test modules. */
  constructor(private readonly project: string) {}

  /** Enumerates owner-declared suite files without executing their modules. */
  discover(component: Component, outputRoot: string): DiscoveredSuite[] {
    const paths = new Set<string>();
    const excluded = component.discovery?.exclude ?? [];
    const roots =
      component.schemaVersion === 5
        ? component.allowedWritePaths
        : (component.discovery?.tests ?? []);
    for (const root of roots) this.walk(root, paths, excluded);
    return [...paths]
      .sort()
      .filter(
        (path) =>
          component.schemaVersion !== 5 || classifyComponentPath(component, path) === 'tests',
      )
      .map((path) => this.suite(component, path, outputRoot));
  }

  /** Visits regular files within the declared root while respecting exclusions. */
  private walk(path: string, paths: Set<string>, excluded: string[]): void {
    if (excluded.some((root) => path === root || path.startsWith(root + '/'))) return;
    const absolute = this.safe(path);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute)) {
        if (child !== 'support') this.walk(join(path, child), paths, excluded);
      }
    } else if (stat.isFile() && path.endsWith('.test.ts')) paths.add(path);
  }

  /** Rejects escaping paths and symlink traversal before reading test source. */
  private safe(path: string): string {
    const root = resolve(this.project);
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root + sep)) throw new InputError(`Escaping test path: ${path}`);
    let cursor = root;
    for (const segment of relative(root, absolute).split(sep)) {
      cursor = join(cursor, segment);
      if (lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink())
        throw new InputError(`Symlink in test path: ${path}`);
    }
    return absolute;
  }

  /** Reads literal suite metadata and maps the source to its compiled test artifact. */
  private suite(component: Component, source: string, outputRoot: string): DiscoveredSuite {
    const text = readFileSync(this.safe(source), 'utf8');
    const metadata = new SuiteMetadataReader().read(source, text);
    if (metadata.component !== component.id) throw new InputError(`Wrong suite owner: ${source}`);
    const category = source.split('/').at(-2)!;
    if (
      !['unit', 'integration', 'acceptance', 'regression'].includes(category) ||
      (category !== 'regression' && category !== metadata.level)
    )
      throw new InputError(`Suite directory and level disagree: ${source}`);
    const sha256 = createHash('sha256').update(text).digest('hex');
    const captured = component.inventory?.find((file) => file.path === source);
    return {
      ...metadata,
      profile: component.testProfile!,
      state: !captured ? 'added' : captured.sha256 === sha256 ? 'unchanged' : 'modified',
      source,
      category,
      compiled: compiledTestPath(component, source, outputRoot),
      sha256,
    };
  }
}

export function matches(suite: DiscoveredSuite, filters: TestFilters): boolean {
  return (
    (!filters.level || suite.level === filters.level) &&
    (!filters.category || suite.category === filters.category) &&
    (filters.tags ?? []).every((tag) => suite.tags?.includes(tag))
  );
}
