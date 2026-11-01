import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { classifyComponentPath, covered, type Component } from '../architecture/components.js';
import { changes, checkScope } from '../change-inspection/changes.js';
import type { AgentResult } from '../steward/codex.js';
import type { RecordData } from '../workspace/state.js';

export interface FrozenTest {
  path: string;
  content: string;
  sha256: string;
}

export function specificationFiles(
  record: RecordData,
  component: Component,
  documentationOnly: boolean,
  selected = changes(record),
): FrozenTest[] {
  const observed = selected;
  const { documentation, testPaths } = specificationPaths(component, observed);
  checkScope(
    record.workspace,
    observed,
    documentationOnly ? documentation : [...documentation, ...testPaths],
  );
  if (!observed.some((c) => covered(c.path, documentation)))
    throw new Error('Specification must document changed intent');
  if (documentationOnly) return [];
  const tests = observed.filter((c) => covered(c.path, testPaths));
  if (!tests.length) throw new Error('Specification must add or update regression tests');
  return tests.map((c) => {
    if (c.kind === 'D') throw new Error('Regression checkpoint cannot delete tests');
    const content = readFileSync(join(record.workspace, c.path));
    return { path: c.path, content: content.toString('base64'), sha256: digest(content) };
  });
}

/** Applies the captured classifier to proposed files without inventing documentation or test evidence. */
function specificationPaths(component: Component, observed: ReturnType<typeof changes>) {
  const documentation =
    component.schemaVersion === 5
      ? observed
          .filter((c) => classifyComponentPath(component, c.path) === 'documentation')
          .map((c) => c.path)
      : component.documentation;
  const testPaths =
    component.schemaVersion === 5
      ? observed
          .filter((c) => classifyComponentPath(component, c.path) === 'tests')
          .map((c) => c.path)
      : component.tests;
  return { documentation, testPaths };
}

export async function withFrozenTests(
  record: RecordData,
  tests: FrozenTest[],
  check: () => Promise<void>,
): Promise<void> {
  checkFrozenPaths(record.workspace, tests);
  const saved = tests.map((t) => {
    const path = join(record.workspace, t.path);
    return { path, content: existsSync(path) ? readFileSync(path) : null };
  });
  try {
    installFrozenTests(record.workspace, tests);
    await check();
    for (const test of tests)
      if (digest(readFileSync(join(record.workspace, test.path))) !== test.sha256)
        throw new Error('Verification altered frozen regression');
  } finally {
    checkFrozenPaths(record.workspace, tests);
    for (const file of saved) {
      if (file.content === null) {
        if (existsSync(file.path)) unlinkSync(file.path);
      } else writeFileSync(file.path, file.content);
    }
  }
}

export { candidateDigest } from '../change-inspection/changes.js';

export function validateRequests(
  result: AgentResult,
  componentId: string,
  owners: string[],
  allowUnknownOwner = false,
  generalYield = false,
): void {
  for (const request of result.requests) {
    if (request.fromComponent !== componentId)
      throw new Error('Boundary request has wrong requesting component');
    if (!allowUnknownOwner && request.ownerId !== null && !owners.includes(request.ownerId))
      throw new Error(
        `Unknown boundary owner: ${request.ownerId}; use null for an architectural question`,
      );
  }
  if (!generalYield && result.requests.length && result.status !== 'blocked')
    throw new Error('Unresolved boundary requests must report blocked');
  if (
    result.status === 'blocked' &&
    !result.blockers.length &&
    !(generalYield && result.requests.length)
  )
    throw new Error('Blocked result requires a reason');
}

function installFrozenTests(workspace: string, tests: FrozenTest[]): void {
  for (const test of tests) {
    const bytes = Buffer.from(test.content, 'base64');
    if (digest(bytes) !== test.sha256) throw new Error('Frozen regression digest mismatch');
    const path = join(workspace, test.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}

function checkFrozenPaths(workspace: string, tests: FrozenTest[]): void {
  checkScope(
    workspace,
    tests.map((t) => ({ path: t.path, kind: 'M' })),
    tests.map((t) => t.path),
  );
}
