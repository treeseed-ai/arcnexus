import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog, Component } from '../architecture/components.js';
import { git } from '../operations/process.js';
import { SuiteMetadataReader } from './metadata.js';
import { loadTestProfile } from './profile.js';
import type { SuiteMetadata } from './suite.js';
import { TestDiscovery } from './discovery.js';

export interface CapturedTest extends SuiteMetadata {
  source: string;
  sha256: string;
}

export { compiledTestPath } from './test-paths.js';

/** Captures mandatory suite identities before candidate edits can affect discovery. */
export function captureComponentTests(catalog: Catalog, repository: string, base: string): void {
  const profiles = new Set<string>();
  for (const component of Object.values(catalog.components)) {
    if (!component.testProfile) continue;
    const profile = loadTestProfile(repository, base, component.testProfile);
    if (!profiles.has(profile.id)) catalog.configurationSources.push(profile.configuration);
    profiles.add(profile.id);
    const revision = catalog.repositoryRevisions?.[component.repository];
    if (!revision) continue;
    component.capturedTests = (component.inventory ?? [])
      .filter(
        (file) =>
          file.kind === 'tests' &&
          file.path.endsWith('.test.ts') &&
          !file.path.split('/').includes('support'),
      )
      .map((file) => ({
        ...new SuiteMetadataReader().read(
          file.path,
          git(revision.source, 'show', `${revision.base}:${file.path}`),
        ),
        source: file.path,
        sha256: file.sha256,
      }));
    if (component.capturedTests.some((suite) => suite.component !== component.id))
      throw new Error(`Captured test owner mismatch: ${component.id}`);
  }
}

/** Rejects deletion or selection-metadata changes to suites captured for host verification. */
export function assertCapturedTests(component: Component, workspace: string): void {
  for (const captured of component.capturedTests ?? []) {
    const current = new SuiteMetadataReader().read(
      captured.source,
      readFileSync(join(workspace, captured.source), 'utf8'),
    );
    if (
      current.component !== captured.component ||
      current.level !== captured.level ||
      JSON.stringify([...(current.tags ?? [])].sort()) !==
        JSON.stringify([...(captured.tags ?? [])].sort())
    )
      throw new Error(`Candidate changed mandatory test selection: ${captured.source}`);
  }
}

/** Selects current owned suites using captured rules and refuses changes to mandatory identities. */
export function currentComponentTests(component: Component, workspace: string, outputRoot: string) {
  assertCapturedTests(component, workspace);
  return new TestDiscovery(workspace).discover(component, outputRoot);
}

export type { DiscoveredSuite } from './discovery.js';
