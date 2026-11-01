import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { operationFixture as fixture } from '../../testing/support/operations-fixture.js';
import { cli, workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Exercises operations behavior through observable scenarios. */
class OperationsTests {
  /** Verifies that production sdkbridge returns real red and green operation feedback. */
  productionSDKBridgeReturnsRealRedAndGreenOperationFeedback(t: TestContext) {
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

  /** Late operation failures remain visible through the production MCP bridge. */
  lateOperationDiagnostic(t: TestContext): void {
    const f = fixture(t);
    const path = join(f.repo, 'verify.cjs');
    writeFileSync(
      path,
      "require('fs').writeSync(1,'passing output\\n'.repeat(12000));" + readFileSync(path, 'utf8'),
    );
    f.commit();
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.root, 'operations.jsonl'), 'utf8'), /BOUNDARY_EXPECTED/);
  }

  /** Verifies the scenario rejects unauthorized operation requests. */
  rejectsUnauthorizedOperationRequests(t: TestContext, mode: any) {
    const f = fixture(t, mode),
      r = f.run();
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, mode === 'denied' ? /operation/i : /budget/i);
  }

  /** Verifies that inspect captures operations and rejects assignment widening. */
  inspectCapturesOperationsAndRejectsAssignmentWidening(t: TestContext) {
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

  /** Verifies that operation output is bounded and excess output terminates the command. */
  async operationOutputIsBoundedAndExcessOutputTerminatesTheCommand(t: TestContext) {
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

  /** Verifies that declared command cannot change source during read only research. */
  declaredCommandCannotChangeSourceDuringReadOnlyResearch(t: TestContext) {
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

  /** Verifies that operation commands do not inherit unrelated credentials. */
  operationCommandsDoNotInheritUnrelatedCredentials(t: TestContext) {
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

  /** Verifies the scenario rejects incompatible operation catalog. */
  rejectsIncompatibleOperationCatalog(t: TestContext, defect: any) {
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
  suite.productionSDKBridgeReturnsRealRedAndGreenOperationFeedback(t));

for (const mode of ['denied', 'budget'])
  test(`host stops ${mode} operation requests`, (t: any) =>
    suite.rejectsUnauthorizedOperationRequests(t, mode));

test('inspect captures operations and rejects assignment widening', (t: any) =>
  suite.inspectCapturesOperationsAndRejectsAssignmentWidening(t));

test('operation output is bounded and excess output terminates the command', (t: any) =>
  suite.operationOutputIsBoundedAndExcessOutputTerminatesTheCommand(t));

test('declared command cannot change source during read-only research', (t: any) =>
  suite.declaredCommandCannotChangeSourceDuringReadOnlyResearch(t));

test('operation commands do not inherit unrelated credentials', (t: any) =>
  suite.operationCommandsDoNotInheritUnrelatedCredentials(t));

for (const defect of ['category', 'output', 'service'])
  test(`built validate rejects operation ${defect} inconsistency`, (t: any) =>
    suite.rejectsIncompatibleOperationCatalog(t, defect));

test('late operation diagnostics reach the production bridge', (t) =>
  suite.lateOperationDiagnostic(t));

registerSuite({ component: 'operations', level: 'acceptance', tags: ['deterministic'] });
