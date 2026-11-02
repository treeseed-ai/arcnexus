import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { OperationExecution } from '../../../../dist/library/operations/operation-execution.js';
import {
  normalizeOperation,
  OperationArguments,
} from '../../../../dist/library/operations/operation-definition.js';
import type { Operation } from '../../../../dist/library/operations/operations.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises actual supervised commands and durable invocation evidence under installed confinement. */
class ExecutionScenarios {
  /** Keeps engineering success separate from later verification and preserves generated evidence. */
  async evidence(t: TestContext): Promise<void> {
    const { root, record } = this.fixture(t);
    const operation = this.operation();
    const executor = new OperationExecution(root, record, new AbortController().signal);
    await executor.run(operation, 'agent');
    writeFileSync(join(record.workspace, 'source.txt'), 'changed');
    await assert.rejects(executor.run(operation, 'verify'), /Command failed/);
    const report = JSON.parse(readFileSync(join(root, 'runs/run/report.json'), 'utf8'));
    const [agent, verify] = report.operationInvocations;
    assert.equal(agent.status, 'completed');
    assert.equal(verify.status, 'failed');
    assert.notEqual(agent.id, verify.id);
    assert.equal(agent.definitionDigest, verify.definitionDigest);
    assert.equal(agent.purpose, 'agent');
    assert.equal(verify.purpose, 'verify');
    assert.deepEqual(agent.arguments, ['check.cjs']);
    assert.equal(agent.runId, record.id);
    assert.equal(agent.artifacts.length, 1);
    assert.equal(verify.artifacts.length, 1);
    assert.equal(
      readFileSync(join(root, 'runs/run', agent.artifacts[0].artifact), 'utf8'),
      'original',
    );
    assert.equal(
      readFileSync(join(root, 'runs/run', verify.artifacts[0].artifact), 'utf8'),
      'changed',
    );
  }

  /** Refuses uncertain operations without repeating their source or output effects. */
  async uncertain(t: TestContext): Promise<void> {
    const { root, record } = this.fixture(t);
    record.operationInvocations = [{ status: 'running', operationId: 'check' }];
    const executor = new OperationExecution(root, record, new AbortController().signal);
    await assert.rejects(executor.run(this.operation(), 'verify'), /completion is uncertain/);
  }

  /** Creates an isolated captured owner and a real command that observes the current source. */
  private fixture(t: TestContext): { root: string; record: RecordData } {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-invocations-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const workspace = join(root, 'source');
    mkdirSync(workspace);
    mkdirSync(join(root, 'runs/run'), { recursive: true });
    writeFileSync(join(workspace, 'source.txt'), 'original');
    writeFileSync(
      join(workspace, 'check.cjs'),
      "const f=require('fs');const value=f.readFileSync('source.txt','utf8');f.writeFileSync('generated/result',value);process.exitCode=value==='original'?0:1;",
    );
    assert.equal(spawnSync('git', ['init', '-q', workspace]).status, 0);
    assert.equal(spawnSync('git', ['-C', workspace, 'add', '.']).status, 0);
    const record = {
      id: 'run',
      workspace,
      commonDir: join(workspace, '.git'),
      commands: [],
      bindings: { tools: { codex: process.env.ARCNEXUS_TEST_CODEX! } },
      resolvedAssignment: {
        context: [{ id: 'owner', repository: 'sample', access: { readPaths: ['.'] } }],
        initialization: {
          catalog: [{ repository: 'sample', allowedWritePaths: ['source.txt', 'check.cjs'] }],
        },
      },
    } as unknown as RecordData;
    return { root, record };
  }

  /** Captures one fixed definition; callers can select purpose but cannot replace its command. */
  private operation(): Operation {
    const operation = normalizeOperation({
      schemaVersion: 4,
      id: 'check',
      purpose: 'Verify observed source',
      repository: 'sample',
      kind: 'command',
      command: process.execPath,
      args: ['check.cjs'],
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      generatedDirectories: ['generated'],
      artifacts: ['generated/result'],
      probes: [],
    });
    return new OperationArguments().capture(operation, {
      ownerId: 'owner',
      ownedPaths: ['source.txt', 'check.cjs'],
      packageRoot: '.',
    });
  }
}

const scenarios = new ExecutionScenarios();

const live = {
  skip: !process.env.ARCNEXUS_TEST_CODEX && 'Live qualification requires ARCNEXUS_TEST_CODEX',
};

test('shared executor retains distinct agent and final verification evidence', live, (t) =>
  scenarios.evidence(t),
);

test('shared executor refuses to replay uncertain operation intent', (t) => scenarios.uncertain(t));

registerSuite({ component: 'operations', level: 'acceptance', tags: ['live'] });
