import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { markdownReport } = await import(
  pathToFileURL(join(resolve(process.argv[2] ?? ''), 'dist/report/report.js')).href
);
const record = {
  id: 'independent-acceptance',
  source: '/source',
  workspace: '/candidate',
  base: 'base',
  branch: 'candidate',
  commonDir: '/git',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  commands: [],
  environment: { prerequisites: [], setup: [], generatedDirectories: [] },
  changes: [
    { path: 'z.ts', kind: 'M' },
    { path: 'a.ts', kind: 'A' },
  ],
};
const original = JSON.stringify(record);
const output = markdownReport(record);
assert.match(output, /^## Changed files$/m);
assert.ok(output.indexOf('a.ts') < output.indexOf('z.ts'));
assert.match(
  output.split('\n').find((line) => line.includes('a.ts')),
  /\bA\b/,
);
assert.match(
  output.split('\n').find((line) => line.includes('z.ts')),
  /\bM\b/,
);
assert.equal(JSON.stringify(record), original, 'Report must not mutate captured evidence');
console.log('Independent report acceptance passed');
