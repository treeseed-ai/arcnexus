import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { assertCapturedTests } from '../../../../dist/library/testing/captured-tests.js';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ComponentTestFixture } from '../support/component-test-fixture.js';

/** Checks that later checkout edits cannot reduce the captured host selection. */
class CapturedTests {
  preservesSelection(t: TestContext, change: 'remove' | 'retag' | 'implementation'): void {
    const fixture = new ComponentTestFixture(t);
    const owner = fixture.assignment().context.at(-1);
    const path = 'tests/unit/small.test.ts';
    if (change === 'remove') unlinkSync(join(fixture.repo, path));
    else {
      const content = readFileSync(join(fixture.repo, path), 'utf8');
      fixture.put(
        path,
        change === 'retag'
          ? content.replace('fast', 'slow')
          : content + '\n// Additional assertion context\n',
      );
    }
    if (change === 'implementation')
      assert.doesNotThrow(() => assertCapturedTests(owner, fixture.repo));
    else
      assert.throws(
        () => assertCapturedTests(owner, fixture.repo),
        /ENOENT|mandatory test selection/,
      );
  }
}

const suite = new CapturedTests();
for (const change of ['remove', 'retag', 'implementation'] as const)
  test(`captured host test selection handles ${change}`, (t) =>
    suite.preservesSelection(t, change));
registerSuite({ component: 'testing', level: 'integration', tags: ['deterministic'] });
