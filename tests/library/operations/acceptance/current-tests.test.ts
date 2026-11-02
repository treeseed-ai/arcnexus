import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  OperationArguments,
  normalizeOperation,
} from '../../../../dist/library/operations/operation-definition.js';
import { OperationExecution } from '../../../../dist/library/operations/operation-execution.js';
import type { Operation } from '../../../../dist/library/operations/operations.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises current test selection without allowing candidate configuration to redefine authority. */
class CurrentTestScenarios {
  /** A standalone host test executes its compilation prerequisite once before observing the current suite. */
  async prerequisites(t: TestContext): Promise<void> {
    const { root, record, op } = this.fixture(t);
    rmSync(join(record.workspace, '.test-build'), { recursive: true });
    const compile = new OperationArguments().capture(
      this.operation('compile', [
        '-e',
        "const f=require('fs');f.mkdirSync('.test-build/unit',{recursive:true});f.copyFileSync('tests/unit/base.test.ts','.test-build/unit/base.test.js');f.appendFileSync('.test-build/count','x');",
      ]),
      op.resolvedContext!,
    );
    const check = new OperationArguments().capture(
      this.operation('test', undefined, ['compile']),
      op.resolvedContext!,
    );
    (record.resolvedAssignment as any).context[0].operationPlan = { verify: [compile, check] };
    const executor = new OperationExecution(root, record, new AbortController().signal);
    await executor.run(check, 'verify');
    assert.equal(readFileSync(join(record.workspace, '.test-build/count'), 'utf8'), 'x');
    const checkpoint = Reflect.get(executor, 'checkpoint');
    assert.equal(typeof checkpoint, 'function');
    await checkpoint.call(executor, [compile, check], 'verify');
    assert.equal(readFileSync(join(record.workspace, '.test-build/count'), 'utf8'), 'xx');
  }

  /** A newly created regression actually runs while the captured operation and selection remain immutable. */
  async discovers(t: TestContext): Promise<void> {
    const { root, record, op } = this.fixture(t);
    const text = this.suite("throw new Error('new regression observed')");
    this.put(record.workspace, 'new', text);
    await assert.rejects(
      new OperationExecution(root, record, new AbortController().signal).run(op, 'verify'),
      /Command failed/,
    );
    const report = JSON.parse(readFileSync(join(root, 'runs/run/report.json'), 'utf8'));
    const invocation = report.operationInvocations.at(-1);
    assert.equal(invocation.definitionDigest, op.definitionDigest);
    assert.ok(invocation.arguments.includes('.test-build/unit/new.test.js'));
    assert.equal(
      invocation.selectedTests.find((s: any) => s.source.endsWith('new.test.ts')).sha256,
      this.hash(text),
    );
    assert.match(readFileSync(invocation.result.log, 'utf8'), /new regression observed/);
    assert.deepEqual(op.resolvedContext!.selectedTestFiles, ['.test-build/unit/base.test.js']);
  }

  /** Changed mandatory suite identity is rejected before a verification command can run. */
  async identity(t: TestContext): Promise<void> {
    const { root, record, op } = this.fixture(t);
    this.put(
      record.workspace,
      'base',
      this.suite('').replace("component:'owner'", "component:'other'"),
    );
    await assert.rejects(
      new OperationExecution(root, record, new AbortController().signal).run(op, 'verify'),
      /mandatory test selection|suite owner/i,
    );
    assert.equal(record.operationInvocations, undefined);
  }

  /** Anchors typed path arguments at the operation cwd without changing their captured repository identities. */
  cwd(): void {
    const op = this.operation();
    const captured = new OperationArguments().capture(
      { ...op, cwd: 'package' },
      {
        ownerId: 'owner',
        ownedPaths: ['package/src'],
        packageRoot: 'package',
        selectedTestFiles: ['.test-build/unit/base.test.js'],
        testOutputRoot: '.test-build',
      },
    );
    assert.ok(captured.kind !== 'http');
    assert.deepEqual(captured.args, ['--test', '../.test-build/unit/base.test.js']);
  }

  /** Constructs an explicit captured owner and real Node tests under a temporary Git workspace. */
  private fixture(t: TestContext) {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-current-tests-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const workspace = join(root, 'source');
    mkdirSync(join(root, 'runs/run'), { recursive: true });
    const text = this.suite('');
    this.put(workspace, 'base', text);
    assert.equal(spawnSync('git', ['init', '-q', workspace]).status, 0);
    assert.equal(spawnSync('git', ['-C', workspace, 'add', 'tests']).status, 0);
    const owner = this.owner(text);
    const record = {
      id: 'run',
      source: workspace,
      workspace,
      commonDir: join(workspace, '.git'),
      commands: [],
      bindings: { tools: { codex: process.env.ARCNEXUS_TEST_CODEX!, node: process.execPath } },
      resolvedAssignment: { context: [owner], initialization: { catalog: [owner] } },
    } as unknown as RecordData;
    const op = new OperationArguments().capture(this.operation(), {
      ownerId: 'owner',
      ownedPaths: ['tests'],
      packageRoot: '.',
      selectedTestFiles: ['.test-build/unit/base.test.js'],
      testOutputRoot: '.test-build',
    });
    return { root, record, op };
  }

  /** Captures the original owned suite identity independently of later candidate edits. */
  private owner(text: string) {
    return {
      id: 'owner',
      schemaVersion: 5,
      repository: 'sample',
      repositoryRoot: '.',
      testProfile: 'node',
      access: { readPaths: ['.'] },
      allowedWritePaths: ['tests'],
      inventory: [{ path: 'tests/unit/base.test.ts', kind: 'tests', sha256: this.hash(text) }],
      capturedTests: [
        {
          component: 'owner',
          level: 'unit',
          source: 'tests/unit/base.test.ts',
          sha256: this.hash(text),
        },
      ],
    };
  }

  /** Defines one command whose token definition remains stable after candidate tests change. */
  private operation(
    id = 'test',
    args: unknown[] = ['--test', { context: 'selectedTestFiles' }],
    prerequisites: string[] = [],
  ): Operation {
    return normalizeOperation({
      schemaVersion: 4,
      id,
      purpose: 'Run owner tests',
      kind: 'command',
      repository: 'sample',
      cwd: '.',
      category: 'unit-test',
      activities: ['testing'],
      command: 'node',
      args,
      generatedDirectories: ['.test-build'],
      artifacts: [],
      prerequisites,
      network: false,
    } as unknown as Operation);
  }

  /** Writes corresponding source and compiled fixture suites without running candidate compilation. */
  private put(workspace: string, name: string, text: string): void {
    for (const [root, extension] of [
      ['tests', 'ts'],
      ['.test-build', 'js'],
    ]) {
      const directory = join(workspace, root!, 'unit');
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${name}.test.${extension}`), text);
    }
  }

  /** Produces literal suite metadata and a real Node test body. */
  private suite(body: string): string {
    return `import {test} from 'node:test';function registerSuite(x){}\nregisterSuite({component:'owner',level:'unit'});test('behavior',()=>{${body}});`;
  }

  /** Computes the observed fixture bytes independently of the invocation record. */
  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}

const scenarios = new CurrentTestScenarios();

test(
  'standalone verification executes prerequisites and checkpoints deduplicate preparation',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.prerequisites(t),
);

test('captured operation path context resolves against its working directory', () =>
  scenarios.cwd());

test(
  'assignment verification discovers and executes new owned regressions',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.discovers(t),
);

test(
  'assignment operations cannot drop captured mandatory test identities',
  { skip: !process.env.ARCNEXUS_TEST_CODEX },
  (t) => scenarios.identity(t),
);

registerSuite({ component: 'operations', level: 'acceptance', tags: ['deterministic'] });
