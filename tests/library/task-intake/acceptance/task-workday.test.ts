import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { handoffFixture } from '../../testing/support/handoff-fixture.js';
import { cli } from '../../testing/support/workflow-fixture.js';

/** Exercises task workday behavior through observable scenarios. */
class TaskWorkdayTests {
  /** Handles routes existing owners within this component’s captured contract. */
  routesExistingOwners(t: TestContext): void {
    const f = handoffFixture(t);
    const bindings = this.bindings(f);
    this.declareDependency(f);
    const input = join(f.root, 'request.txt');
    writeFileSync(input, 'Update sample to consume the dependency contract');
    const planned = this.plan(f, input, bindings);
    assert.equal(planned.status, 0, planned.stderr);
    const proposal = JSON.parse(planned.stdout);
    assert.equal(proposal.status, 'ready');
    assert.equal(proposal.execution.kind, 'workday');
    this.directionEvidence(f, proposal);
    const result = this.command(f, 'run', proposal.id);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'completed');
    assert.equal(report.assignments.length, 2);
    assert.equal(
      readFileSync(f.calls + '.initialization', 'utf8')
        .trim()
        .split('\n').length,
      1,
    );
  }

  /** Handles direction evidence within this component’s captured contract. */
  private directionEvidence(f: any, proposal: any): void {
    const prompt = readFileSync(
      join(f.state, 'runs', proposal.initialization.runId, 'prompt.txt'),
      'utf8',
    );
    assert.match(prompt, /from is the requesting consumer/);
    assert.match(prompt, /"from":"sample","to":"dependency"/);
  }

  /** Handles declare dependency within this component’s captured contract. */
  private declareDependency(f: any): void {
    const path = join(f.repo, 'architecture/components/sample.json');
    const component = JSON.parse(readFileSync(path, 'utf8'));
    component.relatedIds = ['dependency'];
    writeFileSync(path, JSON.stringify(component));
    f.commit();
  }

  /** Handles plan within this component’s captured contract. */
  private plan(f: any, input: string, bindings: string) {
    return this.command(
      f,
      'plan',
      '--input',
      input,
      '--project',
      f.repo,
      '--bindings',
      bindings,
      '--codex-path',
      f.executable,
    );
  }

  /** Handles command within this component’s captured contract. */
  private command(f: any, ...args: string[]) {
    return spawnSync(process.execPath, [cli, 'task', ...args], {
      encoding: 'utf8',
      env: f.env,
      timeout: 30 * 60 * 1000,
    });
  }

  /** Handles bindings within this component’s captured contract. */
  private bindings(f: any): string {
    const path = join(f.root, 'task-bindings.json');
    const dependency = join(f.root, 'dependency-acceptance.cjs');
    writeFileSync(
      dependency,
      "require('assert').equal(require('fs').readFileSync('dependency.txt','utf8'),'after')",
    );
    const combined = join(f.root, 'acceptance.cjs');
    const check = (file: string) => [
      { id: 'external', command: process.execPath, args: [file], artifacts: [file] },
    ];
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        repositories: {},
        tools: {},
        taskAcceptance: {
          sample: check(combined),
          dependency: check(dependency),
          combined: check(combined),
        },
      }),
    );
    return path;
  }
}

const suite = new TaskWorkdayTests();

test('unstructured task uses one initializer and the production two-owner workday', (t) =>
  suite.routesExistingOwners(t));

registerSuite({ component: 'task-intake', level: 'acceptance', tags: ['deterministic'] });
