import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OperationCheckpoint } from '../../../../dist/library/operations/operation-checkpoint.js';
import {
  normalizeOperation,
  OperationArguments,
} from '../../../../dist/library/operations/operation-definition.js';
import type { Operation } from '../../../../dist/library/operations/operations.js';
import type { RecordData } from '../../../../dist/library/workspace/state.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises permission-sensitive checkpoint planning before any supervised command starts. */
class CheckpointScenarios {
  /** Identical commands merge only when their effective read boundaries agree. */
  permissions(): void {
    const first = this.owner('first', ['.', 'src/first']);
    const second = this.owner('second', ['.']);
    const third = this.owner('third', ['src/third']);
    const record = { operationCatalog: [first, second, third] } as unknown as RecordData;
    const operations = [first, second, third].map((owner) => ({
      operation: owner.operationPlan.setup[0]!,
      purpose: 'setup',
    }));
    const planned = new OperationCheckpoint(record).resolve(operations);
    assert.deepEqual(
      planned.map((s) => s.operation.resolvedContext!.ownerId),
      ['first', 'third'],
    );
    assert.equal(new OperationCheckpoint(record).resolve(operations).length, 2);
  }

  /** Missing and cyclic prerequisites fail during planning, without manufacturing completion. */
  dependencies(): void {
    const owner = this.owner('owner', ['.']);
    const operation = owner.operationPlan.setup[0]!;
    const record = { operationCatalog: [owner] } as unknown as RecordData;
    const planner = new OperationCheckpoint(record);
    operation.prerequisites = ['missing'];
    assert.throws(() => planner.resolve([{ operation, purpose: 'setup' }]), /Unknown prerequisite/);
    operation.prerequisites = [operation.id];
    assert.throws(() => planner.resolve([{ operation, purpose: 'setup' }]), /prerequisite cycle/);
  }

  /** Host assignment identity cannot be replaced by a caller-selected owner context. */
  authority(): void {
    const owner = this.owner('owner', ['.']);
    const record = { resolvedAssignment: { context: [owner] } } as unknown as RecordData;
    const operation = this.owner('other', ['.']).operationPlan.setup[0]!;
    assert.throws(
      () => new OperationCheckpoint(record).resolve([{ operation, purpose: 'verify' }]),
      /captured owner authority/,
    );
  }

  /** Captures matching command semantics under distinct owner read policies. */
  private owner(id: string, readPaths: string[]) {
    const operation = new OperationArguments().capture(
      normalizeOperation({
        schemaVersion: 4,
        id: 'build',
        repository: 'sample',
        kind: 'command',
        command: 'node',
        args: ['build.js'],
        cwd: '.',
        prerequisites: [],
        generatedDirectories: ['dist'],
        artifacts: [],
        probes: [],
        category: 'build',
        activities: ['testing'],
        purpose: 'Build shared outputs',
      } as Operation),
      { ownerId: id, ownedPaths: [`src/${id}`], packageRoot: '.' },
    );
    return {
      id,
      repository: 'sample',
      access: { readPaths },
      operationPlan: { setup: [operation] },
    };
  }
}

const scenarios = new CheckpointScenarios();

test('checkpoint equivalence includes effective read authority', () => scenarios.permissions());

test('checkpoint dependencies reject missing references and cycles', () =>
  scenarios.dependencies());

test('checkpoint owner context cannot replace captured assignment authority', () =>
  scenarios.authority());

registerSuite({ component: 'operations', level: 'unit', tags: ['deterministic'] });
