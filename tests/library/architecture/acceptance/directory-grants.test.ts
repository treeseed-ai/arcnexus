import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

class DirectoryGrantTests {
  validate(t: TestContext, directory: string, expected: number): void {
    const fixture = workflowFixture(t);
    if (directory === 'redirect') symlinkSync('source.txt', join(fixture.repo, directory));
    fixture.component.access.writeDirectories = [directory];
    fixture.component.allowedWritePaths = [directory];
    writeFileSync(
      join(fixture.repo, 'architecture/components/sample.json'),
      JSON.stringify(fixture.component),
    );
    fixture.commit();
    const result = spawnSync(process.execPath, [cli, 'validate', '--project', fixture.repo], {
      encoding: 'utf8',
    });
    assert.equal(result.status, expected, result.stderr);
    if (expected !== 0) assert.match(result.stderr, /write directory.*(file|symlink)/i);
  }
}
const suite = new DirectoryGrantTests();
test('catalog rejects a tracked file as a write directory', (t) =>
  suite.validate(t, 'source.txt', 2));
test('catalog rejects a tracked symlink as a write directory', (t) =>
  suite.validate(t, 'redirect', 2));
test('catalog permits a declared directory that preparation will create', (t) =>
  suite.validate(t, 'future', 0));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
