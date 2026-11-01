import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { registerSuite } from '../../../dist/library/testing/suite.js';

/** Checks delivery boundaries without publishing or invoking GitHub. */
class WorkflowTests {
  /** Loads maintained workflow data; missing files fail the public contract. */
  read(name: string): any {
    return parse(readFileSync(`.github/workflows/${name}.yaml`, 'utf8'));
  }

  /** All lifecycle callers share verification and retain their intended triggers. */
  lifecycles(): void {
    const development = this.read('development');
    const staging = this.read('staging');
    const production = this.read('production');
    assert.deepEqual(development.on.pull_request.branches, ['staging']);
    assert.deepEqual(staging.on.push.branches, ['staging']);
    assert.deepEqual(production.on.pull_request.branches, ['main']);
    assert.deepEqual(production.on.push.branches, ['main']);
    assert.deepEqual(production.on.release.types, ['published']);
    assert.equal(development.concurrency['cancel-in-progress'], true);
    assert.equal(staging.concurrency['cancel-in-progress'], false);
    assert.equal(production.concurrency['cancel-in-progress'], false);
    for (const workflow of [development, staging, production]) {
      assert.equal(workflow.jobs.verify.uses, './.github/workflows/verification.yaml');
      assert.deepEqual(workflow.permissions, { contents: 'read' });
    }
    assert.equal(production.jobs.verify.with.distribution, true);
  }

  /** Shared verification pins actions and contains no write or publication capability. */
  verification(): void {
    const workflow = this.read('verification');
    assert.ok(workflow.on.workflow_call);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    const job = workflow.jobs.repository;
    assert.equal(job['timeout-minutes'], 360);
    for (const step of job.steps.filter((step: any) => step.uses))
      assert.match(step.uses, /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
    const commands = job.steps.map((step: any) => step.run ?? '').join('\n');
    for (const command of [
      'npm ci',
      'npm run format:check',
      'npm run lint',
      'npm run check',
      'npm test',
      'guidance validate',
      'validate --project',
      '--help',
    ])
      assert.ok(commands.includes(command), command);
    assert.doesNotMatch(commands, /npm publish|gh release create|docker push|git push/);
    assert.ok(job.steps.some((step: any) => step.if === 'inputs.distribution'));
  }
}

const suite = new WorkflowTests();

test('delivery lifecycle triggers and concurrency remain distinct', () => suite.lifecycles());

test('delivery uses pinned read-only reusable verification', () => suite.verification());

registerSuite({ component: 'release', level: 'acceptance', tags: ['deterministic', 'delivery'] });
