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
  /** Handles selects without execution within this component’s captured contract. */
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

  /** Handles selects regression level within this component’s captured contract. */
  selectsRegressionLevel(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    const result = f.run('inspect', '--category', 'regression', '--level', 'integration');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).suites[0].category, 'regression');
  }

  /** Handles executes once within this component’s captured contract. */
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

  /** Verifies that prepares selected profiles only. */
  preparesSelectedProfilesOnly(t: TestContext): void {
    const fixture = new ComponentTestFixture(t);
    fixture.unusedProfile();
    const result = fixture.run('run', '--tag', 'fast');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(
      report.selection.profiles.map((profile: any) => profile.id),
      ['node'],
    );
    assert.equal(report.commands.length, 2);
  }

  /** Handles prints npm evidence within this component’s captured contract. */
  printsNpmEvidence(t: TestContext): void {
    const fixture = new ComponentTestFixture(t);
    const result = spawnSync(
      process.execPath,
      [resolve('dist/library/testing/npm-tests.js'), 'sample'],
      {
        cwd: fixture.repo,
        encoding: 'utf8',
        env: { ...process.env, ARCNEXUS_STATE_DIR: fixture.state },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# pass 2/);
    assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)!).status, 'passed');
  }

  /** Shared test results retain a late build diagnostic within the model-facing bound. */
  retainsLateDiagnostic(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.profile({ preparation: [{ command: process.execPath, args: ['-e',
      "require('fs').writeSync(1,'passing output\\n'.repeat(12000));console.error('Error: LATE_BUILD_FAILURE');process.exit(1)"] }] });
    const result = f.run('run');
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.match(report.output, /LATE_BUILD_FAILURE/);
    assert.ok(Buffer.byteLength(report.output) <= 16384);
    assert.equal(report.outputTruncated, true);
    assert.ok(existsSync(report.commands[0].log));
  }

  /** Handles retains build failure within this component’s captured contract. */
  retainsBuildFailure(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.put('tests/support/invalid.ts', 'const value: string = 42;');
    f.profile({
      preparation: [
        {
          command: process.execPath,
          args: [
            resolve('node_modules/typescript/bin/tsc'),
            '--noEmit',
            '--skipLibCheck',
            'tests/support/invalid.ts',
          ],
          purpose: 'tests',
        },
      ],
    });
    f.commit();
    const result = f.run('run');
    assert.equal(result.status, 1, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, 'failed');
    assert.equal(evidence.commands[0].exitCode, 2);
    assert.match(readFileSync(evidence.commands[0].log, 'utf8'), /TS2322/);
    assert.match(evidence.output, /TS2322/);
  }

  /** Verifies that captures mandatory selection. */
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

  /** Handles cancels preparation within this component’s captured contract. */
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

  /** Handles explicit timeout is failure within this component’s captured contract. */
  explicitTimeoutIsFailure(t: TestContext): void {
    const fixture = new ComponentTestFixture(t);
    fixture.put('build.cjs', 'setInterval(()=>{},1000)');
    const result = fixture.run('run', '--timeout-seconds', '0.05');
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.match(report.error, /timed out/);
  }

  /** Verifies that rejects unsupported profile. */
  rejectsUnsupportedProfile(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    f.profile({ adapter: 'python' });
    f.commit();
    const result = f.run('inspect');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /test-profile/);
  }

  /** Handles rejects symlink traversal within this component’s captured contract. */
  rejectsSymlinkTraversal(t: TestContext): void {
    const f = new ComponentTestFixture(t);
    symlinkSync('/tmp', join(f.repo, 'tests', 'escape'));
    const result = f.run('inspect');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Symlink/);
  }
}

const suite = new SharedTestingTests();

test('an explicitly configured test timeout is failure rather than caller cancellation', (t) =>
  suite.explicitTimeoutIsFailure(t));

test('npm compatibility runner prints retained test output for CI diagnosis', (t) =>
  suite.printsNpmEvidence(t));

test('test runner prepares only profiles selected by intersecting filters', (t) =>
  suite.preparesSelectedProfilesOnly(t));

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

test('shared test feedback preserves late diagnostics', (t) => suite.retainsLateDiagnostic(t));

registerSuite({ component: 'testing', level: 'acceptance', tags: ['deterministic'] });
