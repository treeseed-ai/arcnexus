import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { SharedTestFixture } from '../support/shared-test-fixture.js';

/** Exercises actual test CLI preparation and execution through installed source confinement. */
class SharedTestScenarios {
  /** Retains failed runner output and operation evidence rather than reporting completed preparation as success. */
  fails(t: TestContext): void {
    const f = new SharedTestFixture(t);
    f.put(
      'tests/unit/small.test.ts',
      "import {test} from 'node:test';function registerSuite(x){}\nregisterSuite({component:'sample',level:'unit',tags:['fast','deterministic']});test('failure',()=>{throw new Error('observed failure')});",
    );
    const result = f.run('run', 'sample', '--bindings', f.bindings());
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.match(report.output, /observed failure/);
    const evidence = JSON.parse(readFileSync(report.operationEvidence, 'utf8'));
    assert.equal(evidence.operationInvocations.at(-1).status, 'failed');
    assert.equal(evidence.status, 'failed');
  }

  /** Shares preparation across owners but retains separate runner identities and selected test paths. */
  multipleOwners(t: TestContext): void {
    const f = new SharedTestFixture(t);
    f.anotherOwner();
    const result = f.run('run', '--bindings', f.bindings());
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const evidence = JSON.parse(readFileSync(JSON.parse(result.stdout).operationEvidence, 'utf8'));
    assert.equal(readFileSync(join(f.repo, '.test-build/prepared'), 'utf8'), 'once\n');
    const invocations = evidence.operationInvocations;
    assert.equal(invocations.filter((op: any) => op.operationId === 'compile').length, 1);
    assert.deepEqual(
      invocations
        .filter((op: any) => op.operationId === 'suites')
        .map((op: any) => op.context.ownerId)
        .sort(),
      ['other', 'sample'],
    );
  }

  /** Runs captured operations and includes new suites without permitting test-code source writes. */
  runs(t: TestContext): void {
    const f = new SharedTestFixture(t);
    f.put(
      'tests/unit/new.test.ts',
      "import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';function registerSuite(x){}\nregisterSuite({component:'sample',level:'unit'});\ntest('source read only',()=>assert.throws(()=>fs.writeFileSync('build.cjs','bad'),e=>['EROFS','EPERM','EACCES'].includes(e.code)));",
    );
    const original = readFileSync(join(f.repo, 'build.cjs'), 'utf8');
    const result = f.run('run', 'sample', '--bindings', f.bindings());
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'passed');
    assert.equal(readFileSync(join(f.repo, 'build.cjs'), 'utf8'), original);
    assert.equal(readFileSync(join(f.repo, '.test-build/prepared'), 'utf8'), 'once\n');
    const evidence = JSON.parse(readFileSync(report.operationEvidence, 'utf8'));
    assert.deepEqual(
      evidence.operationInvocations.map((op: any) => op.operationId),
      ['compile', 'suites'],
    );
    assert.equal(evidence.operationInvocations[1].context.ownerId, 'sample');
    assert.ok(evidence.operationInvocations[1].arguments.includes('.test-build/unit/new.test.js'));
    assert.ok(
      evidence.operationInvocations.every(
        (op: any) => op.definitionDigest && op.status === 'completed',
      ),
    );
  }

  /** Rejects a test profile that references an operation unavailable to its owner. */
  unavailable(t: TestContext): void {
    const f = new SharedTestFixture(t);
    f.extend('architecture/components/package.yaml', (value) => delete value.operations.compile);
    f.commit();
    const result = f.run('inspect', 'sample');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /compile.*setup|preparation.*compile/i);
  }
}

const scenarios = new SharedTestScenarios();

test(
  'shared test failure retains actual runner diagnostics and unsuccessful invocation',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.fails(t),
);

test(
  'shared tests deduplicate preparation and retain distinct owner execution',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.multipleOwners(t),
);

test(
  'shared test operations retain invocations and deny writes from actual test code',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.runs(t),
);

test('shared test preparation rejects unavailable operation references before dispatch', (t) =>
  scenarios.unavailable(t));

registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
