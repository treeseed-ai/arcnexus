import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { CandidateSnapshots } from '../../../../dist/library/workspace/candidates.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../support/general-fixture.js';

/** Ensures read-only policy sees pinned candidate contents rather than mutable delivery bookkeeping. */
class PolicyWorkspaceScenarios {
  /** External edits to a retained read-only workspace require attention before another model activation. */
  async altered(t: TestContext): Promise<void> {
    const { host, run } = await this.fixture(t);
    const record = host.store.run(run.id).data.workspace as any;
    writeFileSync(join(record.workspace, 'source.txt'), 'untrusted alteration');
    await host.tick();
    assert.equal(host.store.run(run.id).status, 'needs_attention');
    assert.match(String(host.store.run(run.id).data.integrityError), /verified snapshot/);
    host.control('pause');
    assert.throws(() => host.control('resume'), /integrity/);
    assert.equal(
      readFileSync(join(record.workspace, 'source.txt'), 'utf8'),
      'untrusted alteration',
    );
  }

  /** A new verified revision is materialized even if the prior delivery workspace changes afterward. */
  async pinned(t: TestContext): Promise<void> {
    const { host, run, f } = await this.fixture(t);
    const record = host.store.run(run.id).data.workspace as any;
    writeFileSync(join(f.repo, 'source.txt'), 'verified delivery');
    const snapshots = new CandidateSnapshots(f.repo, join(f.state, 'snapshots'));
    const revision = snapshots.capture(f.repo, host.context.base);
    writeFileSync(join(f.repo, 'source.txt'), 'before');
    const assignment = host.store.enqueue(run.id, 'b', 'Fixture delivery');
    host.store.complete(assignment.id, ['Explicit deterministic fixture evidence'], {
      candidateRevision: revision,
      candidateRecord: record,
    });
    writeFileSync(join(record.workspace, 'source.txt'), 'untrusted alteration');
    await host.tick();
    const retained = host.store.run(run.id);
    assert.equal(retained.status, 'running', String(retained.data.error));
    const policy = retained.data.workspace as any;
    assert.notEqual(policy.workspace, record.workspace);
    assert.equal(policy.base, revision);
    assert.equal(readFileSync(join(policy.workspace, 'source.txt'), 'utf8'), 'verified delivery');
    assert.equal(
      readFileSync(join(record.workspace, 'source.txt'), 'utf8'),
      'untrusted alteration',
    );
  }

  /** An owner can consider its purpose before its declared future test directory exists. */
  async futureDirectory(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const path = join(f.repo, 'architecture/components/b.json');
    const component = JSON.parse(readFileSync(path, 'utf8'));
    component.access.writeDirectories.push('future/tests');
    writeFileSync(path, JSON.stringify(component));
    f.commit();
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    host.control('start');
    const run = host.store.runs()[0]!;
    for (let owner = 0; owner < 4; owner++) await host.tick();
    const retained = host.store.run(run.id);
    assert.equal(retained.status, 'idle', String(retained.data.error));
    assert.deepEqual(Object.keys(retained.data.stewardshipReviews as object), ['a', 'b', 'c']);
    assert.equal(existsSync(join(f.repo, 'future')), false);
    const record = retained.data.workspace as any;
    assert.equal(existsSync(join(record.workspace, 'future')), false);
  }

  /** Prepares a real disposable policy workspace through the normal host lifecycle. */
  private async fixture(t: TestContext) {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    host.control('start');
    const run = host.store.runs()[0]!;
    await host.tick();
    return { host, run, f };
  }
}

const scenarios = new PolicyWorkspaceScenarios();

test('altered retained policy source blocks dispatch and automatic resumption', (t) =>
  scenarios.altered(t));

test('policy materialization reads the pinned candidate independently of delivery workspaces', (t) =>
  scenarios.pinned(t));

test('read-only stewardship permits absent future owner directories without creating them', (t) =>
  scenarios.futureDirectory(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
