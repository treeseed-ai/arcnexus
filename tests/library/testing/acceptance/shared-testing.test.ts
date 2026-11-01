import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ComponentTestFixture } from '../support/component-test-fixture.js';

/** Exercises static selection and supervised test execution through the built gateway. */
class SharedTestingTests {
  selectsWithoutExecution(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.put(
      'tests/unit/side-effect.test.ts',
      "throw new Error('MUST_NOT_EXECUTE');\nregisterSuite({component:'sample',level:'unit',tags:['fast']});",
    );
    const result = f.run(
      'inspect',
      'sample',
      '--level',
      'unit',
      '--tag',
      'fast',
      '--tag',
      'deterministic',
    );
    assert.equal(result.status, 0, result.stderr);
    const selection = JSON.parse(result.stdout);
    assert.equal(selection.suites.length, 1);
    assert.match(selection.suites[0].source, /small/);
    assert.equal(existsSync(join(f.repo, 'prepared')), false);
  }

  selectsRegressionLevel(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    const result = f.run('inspect', '--category', 'regression', '--level', 'integration');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).suites[0].category, 'regression');
  }

  executesOnce(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    const result = f.run('run');
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, 'passed');
    assert.equal(evidence.commands.length, 2);
    assert.equal(readFileSync(join(f.repo, 'prepared'), 'utf8'), 'built\n');
    assert.match(readFileSync(evidence.commands[1].log, 'utf8'), /# pass 2/);
    assert.equal(existsSync(join(evidence.evidence, 'result.json')), true);
  }

  retainsBuildFailure(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.put('build.cjs', 'process.exit(9)');
    const result = f.run('run');
    assert.equal(result.status, 1, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, 'failed');
    assert.equal(evidence.commands[0].exitCode, 9);
  }

  rejectsUnsupportedProfile(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.profile({ adapter: 'python' });
    f.commit();
    const result = f.run('inspect');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /test-profile/);
  }

  rejectsSymlinkTraversal(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    symlinkSync('/tmp', join(f.repo, 'tests', 'escape'));
    const result = f.run('inspect');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Symlink/);
  }
}

const suite = new SharedTestingTests();
test('test inspection intersects tags without executing modules or preparation', (t) =>
  suite.selectsWithoutExecution(t));
test('test selection combines regression category and explicit integration level', (t) =>
  suite.selectsRegressionLevel(t));
test('shared test runner prepares once and retains real Node results', (t) =>
  suite.executesOnce(t));
test('shared test runner retains compilation failure evidence', (t) =>
  suite.retainsBuildFailure(t));
test('test inspection rejects unsupported runner profiles', (t) =>
  suite.rejectsUnsupportedProfile(t));
test('test discovery rejects symlink traversal', (t) => suite.rejectsSymlinkTraversal(t));
registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
