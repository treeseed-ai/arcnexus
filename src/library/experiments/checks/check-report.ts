import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
class ChangedFilesAcceptance {
  private readonly record = {
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
  async run(target: string): Promise<void> {
    const { markdownReport } = await import(
      pathToFileURL(
        join(
          resolve(target),
          ['dist/library/report/report.js', 'dist/report/report.js', 'dist/report.js'].find(
            (path) => existsSync(join(resolve(target), path)),
          ) ?? 'dist/report.js',
        ),
      ).href
    );
    const original = JSON.stringify(this.record),
      output = markdownReport(this.record);
    assert.match(output, /^## Changed files$/m);
    assert.ok(output.indexOf('a.ts') < output.indexOf('z.ts'));
    assert.match(
      output.split('\n').find((line: string) => line.includes('a.ts')),
      /\bA\b/,
    );
    assert.match(
      output.split('\n').find((line: string) => line.includes('z.ts')),
      /\bM\b/,
    );
    assert.equal(JSON.stringify(this.record), original, 'Report must not mutate captured evidence');
    console.log('Independent report acceptance passed');
  }
}
await new ChangedFilesAcceptance().run(process.argv[2] ?? '');
