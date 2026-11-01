import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { operationFixture } from '../development-tooling/operations-fixture.js';
class ProgressTests {
  repeatedFailures(t: TestContext): void {
    const fixture = operationFixture(t);
    fixture.configure({ operationRepeats: 4 });
    const result = fixture.run();
    assert.equal(result.status, 1, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.outcome, 'needs_attention');
    assert.equal(record.operations.length, 3, 'fourth unchanged action must not execute');
    const events = readFileSync(join(fixture.state, 'runs', record.id, 'timeline.jsonl'), 'utf8');
    assert.match(events, /progress.loop_warning/);
    assert.match(events, /progress.needs_attention/);
  }
}
const suite = new ProgressTests();
test('observable repeated failures diagnose a loop then stop unchanged dispatch', (t) =>
  suite.repeatedFailures(t));
