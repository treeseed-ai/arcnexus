import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { preparePermissions, validateAccess } from "../../dist/architecture/permissions.js";

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'arcnexus-permissions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work');
  mkdirSync(work); writeFileSync(join(work, 'file.txt'), 'fixture');
  return { root, work };
}

test('permission profile quotes absolute TOML path keys and grants minimal reads', t => {
  const { root, work } = workspace(t);
  const prepared = preparePermissions(work, { readPaths: ['file.txt'], writeDirectories: ['generated'] }, ['generated/result.txt'], join(root, 'runs/tmp'));
  assert.ok(prepared.configOverrides.some(value => value.includes(`"${work}/file.txt"="read"`)));
  assert.ok(prepared.configOverrides.some(value => value.includes(`"${work}/generated"="write"`)));
  assert.ok(prepared.configOverrides.some(value => value.includes(`"${join(root, 'runs/tmp')}"="write"`)));
  assert.ok(prepared.configOverrides.some(value => value.includes('":minimal"="read"')));
  assert.equal(prepared.tmpDirectory, join(root, 'runs/tmp'));
});

test('permission preparation creates missing empty write directories but never parent directories', t => {
  const { root, work } = workspace(t);
  const prepared = preparePermissions(work, { readPaths: ['file.txt'], writeDirectories: ['parent/child'] }, ['parent/child/new.txt'], join(root, 'tmp'));
  assert.equal(prepared.createdDirectories.length, 2);
  assert.equal(prepared.filesystem[join(work, 'parent')], undefined);
  assert.ok(prepared.configOverrides.includes('permissions.arcnexus.network.enabled=false'));
  assert.throws(() => preparePermissions(work, { readPaths: ['file.txt'], writeDirectories: [] }, ['parent/new.txt'], join(root, 'tmp')), /not covered/);
});

test('permission preparation rejects missing reads, file write directories and symlink segments', t => {
  const { root, work } = workspace(t);
  assert.throws(() => preparePermissions(work, { readPaths: ['missing'], writeDirectories: [] }, [], join(root, 'tmp')), /does not exist/);
  assert.throws(() => preparePermissions(work, { readPaths: ['file.txt'], writeDirectories: ['file.txt'] }, ['file.txt'], join(root, 'tmp')), /directory/);
  symlinkSync('file.txt', join(work, 'link'));
  assert.throws(() => preparePermissions(work, { readPaths: ['link'], writeDirectories: [] }, [], join(root, 'tmp')), /symlink/);
  assert.throws(() => preparePermissions(work, { readPaths: ['file.txt'], writeDirectories: ['link/child'] }, [], join(root, 'tmp')), /symlink/);
});

test('write coverage requires a declared directory and dot alone grants the whole worktree', t => {
  const { root, work } = workspace(t);
  assert.throws(() => preparePermissions(work, { readPaths: [], writeDirectories: ['generated'] }, ['generated2/file'], join(root, 'tmp')), /not covered/);
  assert.doesNotThrow(() => preparePermissions(work, { readPaths: ['.'], writeDirectories: ['.'] }, ['any/path'], join(root, 'tmp')));
  assert.throws(() => preparePermissions(work, { readPaths: ['.'], writeDirectories: ['.'] }, ['../outside'], join(root, 'tmp')), /Invalid relative path/);
});

test('access policies are required, have both explicit path arrays, and only dot bypasses normal path validation', () => {
  for (const value of [undefined, {}, { readPaths: [] }, { readPaths: ['../x'], writeDirectories: [] }, { readPaths: [], writeDirectories: ['/absolute'] }]) assert.throws(() => validateAccess(value));
  assert.deepEqual(validateAccess({ readPaths: ['.'], writeDirectories: ['.'] }), { readPaths: ['.'], writeDirectories: ['.'] });
});
