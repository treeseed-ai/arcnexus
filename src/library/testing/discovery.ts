import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { InputError } from '../architecture/config.js';
import type { Component } from '../architecture/components.js';
import { SuiteMetadataReader } from './metadata.js';
import type { SuiteMetadata } from './suite.js';

export interface TestFilters {
  component?: string;
  level?: string;
  category?: string;
  tags?: string[];
}
export interface DiscoveredSuite extends SuiteMetadata {
  source: string;
  compiled: string;
  category: string;
  sha256: string;
}

/** Discovers current checkout suites within captured, owner-declared test roots. */
export class TestDiscovery {
  constructor(private readonly project: string) {}

  discover(component: Component, outputRoot: string): DiscoveredSuite[] {
    const paths = new Set<string>();
    for (const root of component.discovery?.tests ?? []) this.walk(root, paths);
    return [...paths].sort().map((path) => this.suite(component, path, outputRoot));
  }

  private walk(path: string, paths: Set<string>): void {
    const absolute = this.safe(path);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute)) {
        if (child !== 'support') this.walk(join(path, child), paths);
      }
    } else if (stat.isFile() && path.endsWith('.test.ts')) paths.add(path);
  }

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
    if (!source.startsWith('tests/'))
      throw new InputError(`Unsupported test source root: ${source}`);
    return {
      ...metadata,
      source,
      category,
      compiled: join(outputRoot, source.slice('tests/'.length).replace(/\.ts$/, '.js')),
      sha256: createHash('sha256').update(text).digest('hex'),
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
