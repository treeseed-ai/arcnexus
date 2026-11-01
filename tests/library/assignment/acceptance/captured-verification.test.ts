import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { CapturedVerification } from '../../../../dist/library/assignment/captured-verification.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { workflowFixture, type WorkflowFixture } from '../../testing/support/workflow-fixture.js';

/** Runs actual captured checks against changed source to detect acceptance that restores implementation. */
class CapturedVerificationScenarios {
  /** A weakened check must fail when restored against a broken candidate implementation. */
  async broken(t: TestContext): Promise<void> {
    const f = this.fixture(t);
    const verifier = this.verifier(f);
    writeFileSync(join(f.repo, 'source.txt'), 'broken');
    writeFileSync(join(f.repo, 'verify.cjs'), 'process.exit(0);');
    await assert.rejects(() => verifier.verify(), /Command failed/);
    assert.equal(readFileSync(join(f.repo, 'source.txt'), 'utf8'), 'broken');
    assert.equal(readFileSync(join(f.repo, 'verify.cjs'), 'utf8'), 'process.exit(0);');
  }

  /** Directory-valued command arguments do not make unrelated documentation a captured check input. */
  async documentation(t: TestContext): Promise<void> {
    const f = this.fixture(t);
    let checks = 0;
    const verifier = this.verifier(f, () => {
      checks++;
    });
    writeFileSync(join(f.repo, 'docs/behavior.md'), 'A documentation-only update');
    await verifier.verify();
    assert.equal(checks, 0);
  }

  /** Captures a passing source/check pair before introducing candidate-only changes. */
  private fixture(t: TestContext): WorkflowFixture {
    const f = workflowFixture(t);
    writeFileSync(join(f.repo, 'source.txt'), 'good');
    writeFileSync(
      join(f.repo, 'verify.cjs'),
      "if(require('node:fs').readFileSync('source.txt','utf8')!=='good') process.exit(1);",
    );
    f.commit();
    return f;
  }

  /** Supplies the real filesystem and command boundary used by the built captured-verification component. */
  private verifier(f: WorkflowFixture, observed = () => {}) {
    const check = { command: process.execPath, args: ['verify.cjs', '--project', '.'] };
    return new CapturedVerification({
      options: { record: { generalExecution: true, source: f.repo, workspace: f.repo } },
      resolved: { base: f.git('rev-parse', 'HEAD') },
      component: { tests: [], verification: [check] },
      safe: () => {},
      command: async () => {
        observed();
        execFileSync(check.command, check.args, { cwd: f.repo, stdio: 'pipe' });
      },
    } as any);
  }
}

const scenarios = new CapturedVerificationScenarios();

test('captured acceptance retains broken candidate implementation while restoring weakened checks', (t) =>
  scenarios.broken(t));

test('project directory arguments do not recapture unrelated documentation', (t) =>
  scenarios.documentation(t));

registerSuite({ component: 'assignment', level: 'acceptance', tags: ['deterministic'] });
