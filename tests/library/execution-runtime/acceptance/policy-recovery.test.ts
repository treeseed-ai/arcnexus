import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Injects host loss at retained policy checkpoints and verifies that uncertain operations cannot replay. */
class PolicyRecoveryScenarios {
  /** Unfinished policy roles retain their evidence and prevent resumed dispatch. */
  async uncertain(t: TestContext, role: string): Promise<void> {
    const { f, context, host, run, path, record } = await this.fixture(t);
    record.activationRole = role;
    record.status = 'running';
    record.currentOperation = 'uncertain-policy-operation';
    record.operations = [{ id: 'completed-operation', status: 'passed' }];
    writeFileSync(path, JSON.stringify(record));
    host.store.close();
    const recovered = new ProjectHost(f.state, context);
    t.after(() => recovered.store.close());
    const calls = readFileSync(f.calls, 'utf8');
    assert.throws(() => recovered.control('resume'), /policy.*uncertain/i);
    await recovered.tick();
    assert.equal(recovered.store.run(run.id).status, 'needs_attention');
    assert.equal(readFileSync(f.calls, 'utf8'), calls);
    const retained = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(retained.status, 'interrupted');
    assert.equal(retained.currentOperation, record.currentOperation);
    assert.deepEqual(retained.operations, record.operations);
    assert.deepEqual(recovered.store.run(run.id).data.uncertainPolicyRecords, [record.id]);
  }

  /** A completed policy checkpoint does not suppress a safe fresh stewardship pass. */
  async completed(t: TestContext): Promise<void> {
    const { f, context, host, run, record } = await this.fixture(t);
    assert.equal(record.status, 'completed');
    host.store.close();
    const recovered = new ProjectHost(f.state, context);
    t.after(() => recovered.store.close());
    recovered.control('resume');
    await recovered.tick();
    assert.equal(recovered.store.run(run.id).status, 'running');
    assert.equal(recovered.store.run(run.id).data.uncertainPolicyRecords, undefined);
  }

  /** Creates actual policy evidence through production direction before simulating a lost completion checkpoint. */
  private async fixture(t: TestContext) {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    const host = new ProjectHost(f.state, context);
    host.control('start');
    const run = host.store.runs()[0]!;
    await host.tick();
    const paths = readdirSync(join(f.state, 'runs')).map((id) =>
      join(f.state, 'runs', id, 'report.json'),
    );
    const path = paths.find(
      (path) => JSON.parse(readFileSync(path, 'utf8')).activationRole === 'stewardship',
    )!;
    assert.ok(path);
    return { f, context, host, run, path, record: JSON.parse(readFileSync(path, 'utf8')) };
  }
}

const scenarios = new PolicyRecoveryScenarios();

for (const role of ['stewardship', 'director', 'director-assessment'])
  test('uncertain ' + role + ' operations prevent workday replay after host loss', (t) =>
    scenarios.uncertain(t, role),
  );

test('completed policy checkpoints permit safe workday recovery', (t) => scenarios.completed(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
