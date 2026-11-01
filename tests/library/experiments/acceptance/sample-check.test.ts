import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';

/** Exercises sample check behavior through observable scenarios. */
class SampleCheckTests {
  /** Verifies the scenario checks expiration boundary independently. */
  checksExpirationBoundaryIndependently(t: TestContext, implementation: any, expected: any) {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-independent-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/identity.mjs'),
      `export const normalizeIdentity = value => value.trim().toLowerCase();\n${implementation}`,
    );
    const r = spawnSync(process.execPath, ['scripts/check-sample.mjs', root], { encoding: 'utf8' });
    assert.equal(r.status, expected, r.stderr);
    if (expected === 1) assert.match(r.stderr, /isSessionExpired|AssertionError/);
  }
}

const suite = new SampleCheckTests();

for (const [name, implementation, expected] of [
  ['missing', '', 1],
  ['wrong boundary', 'export const isSessionExpired=(expiry,now)=>now>expiry;', 1],
  ['correct', 'export const isSessionExpired=(expiry,now)=>now>=expiry;', 0],
])
  test(`independent checker: ${name}`, (t: any) =>
    suite.checksExpirationBoundaryIndependently(t, implementation, expected));

registerSuite({ component: 'experiments', level: 'acceptance', tags: ['deterministic'] });
