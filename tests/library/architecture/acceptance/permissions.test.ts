import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import {
  preparePermissions,
  validateAccess,
} from '../../../../dist/library/architecture/permissions.js';

/** Exercises permissions behavior through observable scenarios. */
class PermissionsTests {
  /** Verifies that permission profile quotes absolute tomlpath keys and grants minimal reads. */
  permissionProfileQuotesAbsoluteTOMLPathKeysAndGrantsMinimalReads(t: TestContext) {
    const { root, work } = workspace(t);
    const prepared = preparePermissions(
      work,
      { readPaths: ['file.txt'], writeDirectories: ['generated'] },
      ['generated/result.txt'],
      join(root, 'runs/tmp'),
    );
    assert.ok(
      prepared.configOverrides.some((value: any) => value.includes(`"${work}/file.txt"="read"`)),
    );
    assert.ok(
      prepared.configOverrides.some((value: any) => value.includes(`"${work}/generated"="write"`)),
    );
    assert.ok(
      prepared.configOverrides.some((value: any) =>
        value.includes(`"${join(root, 'runs/tmp')}"="write"`),
      ),
    );
    assert.ok(prepared.configOverrides.some((value: any) => value.includes('":minimal"="read"')));
    assert.equal(prepared.tmpDirectory, join(root, 'runs/tmp'));
  }

  /** Verifies that permission preparation creates missing empty write directories but never parent directories. */
  permissionPreparationCreatesMissingEmptyWriteDirectoriesButNeverParentDirectories(
    t: TestContext,
  ) {
    const { root, work } = workspace(t);
    const prepared = preparePermissions(
      work,
      { readPaths: ['file.txt'], writeDirectories: ['parent/child'] },
      ['parent/child/new.txt'],
      join(root, 'tmp'),
    );
    assert.equal(prepared.createdDirectories.length, 2);
    assert.equal(prepared.filesystem[join(work, 'parent')], undefined);
    assert.ok(prepared.configOverrides.includes('permissions.arcnexus.network.enabled=false'));
    assert.throws(
      () =>
        preparePermissions(
          work,
          { readPaths: ['file.txt'], writeDirectories: [] },
          ['parent/new.txt'],
          join(root, 'tmp'),
        ),
      /not covered/,
    );
  }

  /** Verifies that permission preparation rejects missing reads file write directories and symlink segments. */
  permissionPreparationRejectsMissingReadsFileWriteDirectoriesAndSymlinkSegments(t: TestContext) {
    const { root, work } = workspace(t);
    this.rejectPolicy(root, work, ['missing'], [], [], /does not exist/);
    this.rejectPolicy(root, work, ['file.txt'], ['file.txt'], ['file.txt'], /directory/);
    symlinkSync('file.txt', join(work, 'link'));
    this.rejectPolicy(root, work, ['link'], [], [], /symlink/);
    this.rejectPolicy(root, work, ['file.txt'], ['link/child'], [], /symlink/);
  }

  /** Verifies that write coverage requires adeclared directory and dot alone grants the whole worktree. */
  writeCoverageRequiresADeclaredDirectoryAndDotAloneGrantsTheWholeWorktree(t: TestContext) {
    const { root, work } = workspace(t);
    this.rejectPolicy(root, work, [], ['generated'], ['generated2/file'], /not covered/);
    assert.doesNotThrow(() =>
      preparePermissions(
        work,
        { readPaths: ['.'], writeDirectories: ['.'] },
        ['any/path'],
        join(root, 'tmp'),
      ),
    );
    this.rejectPolicy(root, work, ['.'], ['.'], ['../outside'], /Invalid relative path/);
  }

  /** Requires unsafe directory and exact-scope combinations to fail permission preparation. */
  private rejectPolicy(
    root: string,
    work: string,
    readPaths: string[],
    writeDirectories: string[],
    scope: string[],
    diagnostic: RegExp,
  ): void {
    assert.throws(
      () => preparePermissions(work, { readPaths, writeDirectories }, scope, join(root, 'tmp')),
      diagnostic,
    );
  }

  /** Verifies that access policies are required have both explicit path arrays and only dot bypasses normal path validation. */
  accessPoliciesAreRequiredHaveBothExplicitPathArraysAndOnlyDotBypassesNormalPathValidation() {
    for (const value of [
      undefined,
      {},
      { readPaths: [] },
      { readPaths: ['../x'], writeDirectories: [] },
      { readPaths: [], writeDirectories: ['/absolute'] },
    ])
      assert.throws(() => validateAccess(value));
    assert.deepEqual(validateAccess({ readPaths: ['.'], writeDirectories: ['.'] }), {
      readPaths: ['.'],
      writeDirectories: ['.'],
    });
  }
}

const suite = new PermissionsTests();

function workspace(t: any): any {
  const root = mkdtempSync(join(tmpdir(), 'arcnexus-permissions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work');
  mkdirSync(work);
  writeFileSync(join(work, 'file.txt'), 'fixture');
  return { root, work };
}

test('permission profile quotes absolute TOML path keys and grants minimal reads', (t: any) =>
  suite.permissionProfileQuotesAbsoluteTOMLPathKeysAndGrantsMinimalReads(t));

test('permission preparation creates missing empty write directories but never parent directories', (t: any) =>
  suite.permissionPreparationCreatesMissingEmptyWriteDirectoriesButNeverParentDirectories(t));

test('permission preparation rejects missing reads, file write directories and symlink segments', (t: any) =>
  suite.permissionPreparationRejectsMissingReadsFileWriteDirectoriesAndSymlinkSegments(t));

test('write coverage requires a declared directory and dot alone grants the whole worktree', (t: any) =>
  suite.writeCoverageRequiresADeclaredDirectoryAndDotAloneGrantsTheWholeWorktree(t));

test('access policies are required, have both explicit path arrays, and only dot bypasses normal path validation', () =>
  suite.accessPoliciesAreRequiredHaveBothExplicitPathArraysAndOnlyDotBypassesNormalPathValidation());

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
