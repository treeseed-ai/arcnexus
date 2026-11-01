import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { TestProcess, waitFor } from '../development-tooling/test-process.js';
import { cli } from '../development-tooling/workflow-fixture.js';
import { operationFixture } from '../development-tooling/operations-fixture.js';
class OperationQueueTests {
  serializes(t: TestContext): void {
    const f = this.fixture(t, "setTimeout(()=>console.log('Completed queued operation'),2000)");
    const result = f.run('--kind', 'research');
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.operationCalls, 2);
    assert.equal(record.operations.length, 2);
    const [first, second] = record.operations;
    assert.notEqual(first.log, second.log);
    assert.ok(Date.parse(second.startedAt) >= Date.parse(first.startedAt) + first.durationMs);
    for (const op of record.operations) assert.equal(op.exitCode, 0);
  }
  async cancelsQueued(t: TestContext): Promise<void> {
    const f = this.fixture(t, 'setInterval(()=>{},1000)');
    const child = new TestProcess(
      t,
      [
        cli,
        'run',
        'sample',
        'Inspect',
        '--kind',
        'research',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
      ],
      f.env,
    );
    await waitFor(() => this.record(f)?.operationCalls === 2, 'Both operations queued');
    child.kill('SIGTERM');
    assert.equal(await child.closed, 130, child.stderr);
    const record = JSON.parse(child.stdout);
    assert.equal(record.operations.length, 1);
    assert.equal(record.operationCalls, 2);
    assert.equal(record.status, 'cancelled');
  }
  private record(f: any): any {
    for (const id of readdirSync(join(f.state, 'runs'))) {
      const r = JSON.parse(readFileSync(join(f.state, 'runs', id, 'report.json'), 'utf8'));
      if (r.resolvedAssignment?.componentId === 'sample') return r;
    }
  }
  private fixture(t: TestContext, command: string): any {
    const f = operationFixture(t);
    const path = join(f.repo, 'architecture/operations/test.json');
    const op = JSON.parse(readFileSync(path, 'utf8'));
    op.args = ['-e', command];
    delete op.timeoutSeconds;
    writeFileSync(path, JSON.stringify(op));
    f.commit();
    f.configure({
      planning: true,
      parallelOperations: true,
      operations: join(f.root, 'operations.jsonl'),
    });
    return f;
  }
}
const suite = new OperationQueueTests();
test('concurrent valid operation requests execute serially with separate evidence', (t) =>
  suite.serializes(t));

test('cancellation stops active operation and prevents queued execution', (t) =>
  suite.cancelsQueued(t));
