import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { operationFixture } from '../development-tooling/operations-fixture.js';
class PendingOperationTests {
  waitsWithoutRestart(t: TestContext): void {
    const f = operationFixture(t);
    const path = join(f.repo, 'architecture/operations/test.json');
    const op = JSON.parse(readFileSync(path, 'utf8'));
    delete op.timeoutSeconds;
    op.args = [
      '-e',
      "setTimeout(()=>console.log('Finished after transport observation window'),2100)",
    ];
    writeFileSync(path, JSON.stringify(op));
    f.commit();
    const result = f.run('--kind', 'research');
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.operationCalls, 1);
    assert.equal(record.operations.length, 1);
    assert.ok(
      existsSync(join(f.root, 'operations.jsonl.pending')),
      'Host returns pending while work continues',
    );
    assert.ok(record.operations[0].durationMs >= 2100);
    assert.match(
      readFileSync(join(f.root, 'operations.jsonl'), 'utf8'),
      /Finished after transport/,
    );
  }
}
const suite = new PendingOperationTests();
test('SDK bridge observes a long operation without timing it out or invoking it twice', (t) =>
  suite.waitsWithoutRestart(t));
