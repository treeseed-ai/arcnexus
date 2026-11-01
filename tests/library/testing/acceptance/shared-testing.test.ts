import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { TestProcess, waitFor } from '../support/test-process.js';
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

  capturesMandatorySelection(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    const result = spawnSync(
      process.execPath,
      [resolve('dist/cli.js'), 'inspect', 'sample', 'Improve tests', '--project', f.repo, '--json'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const assignment = JSON.parse(result.stdout);
    assert.equal(assignment.context.at(-1).capturedTests.length, 2);
    assert.ok(
      assignment.configurationSources.some(
        (source: any) =>
          source.path === 'architecture/test-profiles/node.yaml' && source.sourceHash,
      ),
    );
  }

  async cancelsPreparation(t: TestContext): Promise<void> {
    const f = new ComponentTestFixture(t);
    f.put(
      'build.cjs',
      "require('fs').writeFileSync('prepared',String(process.pid));setInterval(()=>{},1000)",
    );
    const child = new TestProcess(
      t,
      [resolve('dist/cli.js'), 'test', 'run', '--project', f.repo, '--json'],
      { ...process.env, ARCNEXUS_STATE_DIR: f.state },
    );
    await waitFor(() => existsSync(join(f.repo, 'prepared')), 'test preparation starts');
    child.child.kill('SIGINT');
    assert.equal(await child.closed, 130, child.stderr);
    const report = JSON.parse(child.stdout);
    assert.equal(report.status, 'cancelled');
    const pid = Number(readFileSync(join(f.repo, 'prepared'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
    assert.equal(existsSync(join(report.evidence, 'result.json')), true);
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
test('assignment inspection captures mandatory suite identities and profile hashes', (t) =>
  suite.capturesMandatorySelection(t));
test('test cancellation stops preparation and retains evidence', (t) =>
  suite.cancelsPreparation(t));
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
