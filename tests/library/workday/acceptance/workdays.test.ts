import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';
class WorkdaysTests {
  builtWorkdayInspectCapturesTwoDisjointOwnersWithoutStateOrInference_1(t: TestContext) {
    const f = fixture(t),
      r = f.workday('inspect', f.path, '--project', f.repo, '--json');
    assert.equal(r.status, 0, r.stderr);
    const x = JSON.parse(r.stdout);
    assert.equal(x.requester.resolved.componentId, 'sample');
    assert.equal(x.recipient.resolved.componentId, 'dependency');
    assert.ok(x.digest);
    assert.equal(x.base, f.git('rev-parse', 'HEAD'));
    assert.equal(existsSync(f.state), false);
    assert.equal(existsSync(f.calls), false);
  }
  workdayInspectionRejectsOverlapInvalidEdgesAndUnsupportedVersions_2(t: TestContext) {
    const f = fixture(t);
    for (const change of [
      () => {
        f.manifest.dependency.to = 'sample';
      },
      () => {
        f.manifest.dependency.to = 'dependency';
        f.manifest.recipient.component = 'sample';
      },
      () => {
        f.manifest.recipient.component = 'dependency';
        f.manifest.schemaVersion = 99;
      },
    ]) {
      change();
      f.save();
      assert.equal(f.workday('inspect', f.path, '--project', f.repo).status, 2);
    }
    assert.equal(existsSync(f.state), false);
  }
  standaloneExecutionRetainsHostCheckedCheckpointEvidence_3(t: TestContext) {
    const f = workflowFixture(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout),
      p = join(f.state, 'runs', report.id, 'checkpoint.json');
    assert.ok(existsSync(p));
    const c = JSON.parse(String(readFileSync(p)));
    assert.equal(c.threadId, 'workflow-thread');
    assert.equal(c.activity, 'review');
    assert.equal(c.implementationAttempts, 1);
    assert.ok(c.frozenTests.length);
    assert.equal(c.authorityHash, report.resolvedAssignment.digest);
  }
}
const suite = new WorkdaysTests();

function fixture(t: any): any {
  const f = workflowFixture(t);
  defineParticipants(f);
  const manifest = {
    schemaVersion: 1,
    requester: { component: 'sample', assignment: 'requester.json', refresh: [] },
    recipient: { component: 'dependency', assignment: 'recipient.json', refresh: [] },
    dependency: {
      from: 'sample',
      to: 'dependency',
      contract: 'sample-contract',
      delivery: 'Verified dependency contract',
    },
    acceptance: [],
  };
  const path = join(f.root, 'workday.json');
  const save = () => writeFileSync(path, JSON.stringify(manifest));
  save();
  const run = (...args: any) =>
    spawnSync(process.execPath, [cli, 'workday', ...args], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
  return { ...f, manifest, path, save, workday: run };
}
function defineParticipants(f: any): void {
  const dependency = {
    ...f.component,
    id: 'dependency',
    path: 'dependency.txt',
    allowedWritePaths: ['dependency.txt', 'dependency-docs', 'dependency-tests'],
    documentation: ['dependency-docs'],
    tests: ['dependency-tests'],
  };
  writeFileSync(
    join(f.repo, 'architecture/components/dependency.json'),
    JSON.stringify(dependency),
  );
  f.commit();
  const assignment = {
    schemaVersion: 2,
    kind: 'change',
    objective: 'Implement bounded contract',
    expectedOutcome: 'Verified behavior',
    acceptanceCriteria: ['Contract works'],
    hostChecks: [],
  };
  for (const name of ['requester', 'recipient'])
    writeFileSync(join(f.root, name + '../.json'), JSON.stringify(assignment));
}
test('built workday inspect captures two disjoint owners without state or inference', (t: any) =>
  suite.builtWorkdayInspectCapturesTwoDisjointOwnersWithoutStateOrInference_1(t));
test('workday inspection rejects overlap invalid edges and unsupported versions', (t: any) =>
  suite.workdayInspectionRejectsOverlapInvalidEdgesAndUnsupportedVersions_2(t));
test('standalone execution retains host-checked checkpoint evidence', (t: any) =>
  suite.standaloneExecutionRetainsHostCheckedCheckpointEvidence_3(t));

registerSuite({ component: 'workday', level: 'acceptance', tags: ['deterministic'] });
