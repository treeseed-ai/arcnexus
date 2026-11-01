import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { operationFixture as fixture } from '../../testing/support/operations-fixture.js';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';
class OperationsTests {
  productionSDKBridgeReturnsRealRedAndGreenOperationFeedback_1(t: TestContext) {
    const f = fixture(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.operations.length, 3);
    assert.deepEqual(
      v.operations.map((o: any) => o.exitCode),
      [1, 0, 0],
    );
    assert.match(readFileSync(join(f.root, 'operations.jsonl'), 'utf8'), /BOUNDARY_EXPECTED/);
  }
  scenario_2(t: TestContext, mode: any) {
    const f = fixture(t, mode),
      r = f.run();
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, mode === 'denied' ? /operation/i : /budget/i);
  }
  inspectCapturesOperationsAndRejectsAssignmentWidening_3(t: TestContext) {
    const f = fixture(t),
      r = spawnSync(
        process.execPath,
        [cli, 'inspect', 'sample', 'Objective', '--project', f.repo, '--json'],
        { encoding: 'utf8' },
      );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).operations[0].id, 'test');
    const path = join(f.root, 'assignment.json');
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        kind: 'research',
        objective: 'Read',
        expectedOutcome: 'Evidence',
        acceptanceCriteria: ['Evidence'],
        hostChecks: [],
        operationIds: ['unknown'],
      }),
    );
    const denied = spawnSync(
      process.execPath,
      [cli, 'inspect', 'sample', '--assignment', path, '--project', f.repo],
      { encoding: 'utf8' },
    );
    assert.equal(denied.status, 2);
    assert.match(denied.stderr, /widens operation/);
  }
  async operationOutputIsBoundedAndExcessOutputTerminatesTheCommand_4(t: TestContext) {
    const { execute } = await import('../../../../dist/library/operations/process.js');
    const f = workflowFixture(t),
      log = join(f.root, 'large.log');
    await assert.rejects(
      execute(
        {
          command: process.execPath,
          args: [
            '-e',
            "const b=Buffer.alloc(1024*1024,'x');setInterval(()=>process.stdout.write(b),1)",
          ],
        },
        f.repo,
        log,
        new AbortController().signal,
        { timeoutMs: 5000 },
      ),
      /output limit/,
    );
    const { statSync } = await import('node:fs');
    assert.equal(statSync(log).size, 64 * 1024 * 1024);
  }
  declaredCommandCannotChangeSourceDuringReadOnlyResearch_5(t: TestContext) {
    const f = fixture(t);
    const p = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(p)));
    op.args = ['-e', "require('fs').writeFileSync('source.txt','unauthorized')"];
    writeFileSync(p, JSON.stringify(op));
    f.commit();
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /scope|Read-only/);
  }
  operationCommandsDoNotInheritUnrelatedCredentials_6(t: TestContext) {
    const f = fixture(t);
    const p = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(p)));
    op.args = ['-e', 'if(process.env.ARCNEXUS_TEST_SECRET)process.exit(7)'];
    writeFileSync(p, JSON.stringify(op));
    f.commit();
    const r = spawnSync(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        'Research',
        '--kind',
        'research',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
      ],
      {
        env: { ...f.env, ARCNEXUS_TEST_SECRET: 'do-not-forward' },
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).operations[0].exitCode, 0);
  }
  scenario_7(t: TestContext, defect: any) {
    const f = fixture(t),
      p = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(p)));
    if (defect === 'category') {
      const path = join(f.repo, 'architecture/execution-profiles/luna.yaml'),
        profile = JSON.parse(String(readFileSync(path)));
      profile.operationCategories = [];
      writeFileSync(path, JSON.stringify(profile));
    }
    if (defect === 'output') op.generatedDirectories = ['undeclared'];
    if (defect === 'service') {
      op.kind = 'http';
      delete op.command;
      delete op.args;
      op.http = { serviceId: 'absent', path: '/', expectedStatus: 200 };
    }
    writeFileSync(p, JSON.stringify(op));
    f.commit();
    const r = spawnSync(process.execPath, [cli, 'validate', '--project', f.repo], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
  }
}
const suite = new OperationsTests();

test('production SDK bridge returns real red and green operation feedback', (t: any) =>
  suite.productionSDKBridgeReturnsRealRedAndGreenOperationFeedback_1(t));
for (const mode of ['denied', 'budget'])
  test(`host stops ${mode} operation requests`, (t: any) => suite.scenario_2(t, mode));
test('inspect captures operations and rejects assignment widening', (t: any) =>
  suite.inspectCapturesOperationsAndRejectsAssignmentWidening_3(t));
test('operation output is bounded and excess output terminates the command', (t: any) =>
  suite.operationOutputIsBoundedAndExcessOutputTerminatesTheCommand_4(t));
test('declared command cannot change source during read-only research', (t: any) =>
  suite.declaredCommandCannotChangeSourceDuringReadOnlyResearch_5(t));
test('operation commands do not inherit unrelated credentials', (t: any) =>
  suite.operationCommandsDoNotInheritUnrelatedCredentials_6(t));
for (const defect of ['category', 'output', 'service'])
  test(`built validate rejects operation ${defect} inconsistency`, (t: any) =>
    suite.scenario_7(t, defect));

registerSuite({ component: 'operations', level: 'acceptance', tags: ['deterministic'] });
