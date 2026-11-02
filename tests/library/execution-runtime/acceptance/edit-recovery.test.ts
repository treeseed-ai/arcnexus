import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { digest } from '../../../../dist/library/architecture/assignment.js';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { createWorkspace, prepareWorkspace } from '../../../../dist/library/workspace/workspace.js';
import { save, type RecordData } from '../../../../dist/library/workspace/state.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Exercises actual host restart around retained source-edit intent without replaying model work. */
class EditRecoveryScenarios {
  /** Completes a journaled edit while keeping its interrupted activation and uncertain operation blocked. */
  async recovers(t: TestContext, conflict: boolean): Promise<void> {
    const { f, context, record, assignment } = await this.fixture(t);
    this.crash(f.state, record);
    if (conflict) writeFileSync(join(record.workspace, 'docs/behavior.md'), 'unexpected');
    let host = new ProjectHost(f.state, context);
    assert.equal(
      readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'),
      conflict ? 'unexpected' : 'after',
    );
    assert.equal(host.store.assignment(assignment.id).status, 'interrupted');
    assert.equal(
      (host.store.assignment(assignment.id).data.lastFailedOutcome as { kind: string }).kind,
      'completed',
    );
    assert.equal(host.store.latestDelivery(context.base, context.packageId), undefined);
    this.retained(f.state, record.id, conflict);
    assert.throws(() => host.control('resume'), /checkpoint|uncertain|recovery/i);
    host.store.close();
    host = new ProjectHost(f.state, context);
    t.after(() => host.store.close());
    assert.equal(
      readFileSync(join(record.workspace, 'docs/behavior.md'), 'utf8'),
      conflict ? 'unexpected' : 'after',
    );
  }

  /** Checks that private evidence records uncertainty instead of inventing a safe checkpoint. */
  private retained(root: string, id: string, conflict: boolean): void {
    const retained = JSON.parse(readFileSync(join(root, 'runs', id, 'report.json'), 'utf8'));
    assert.equal(retained.safeCheckpoint, false);
    assert.equal(retained.status, conflict ? 'needs_attention' : 'interrupted');
    assert.equal(retained.operationInvocations[0].status, 'interrupted');
    assert.equal(retained.editRecovery.status, conflict ? 'needs_attention' : 'reconciled');
  }

  /** Captures an explicit checked-edit record attached to a durable running assignment. */
  private async fixture(t: TestContext) {
    const f = new GeneralFixture(t).fixture;
    const context = new ExecutionContext().resolve(f.repo);
    const host = new ProjectHost(f.state, context);
    host.control('start');
    const run = host.store.runs()[0]!;
    const assignment = host.store.enqueue(run.id, 'a', 'Retain interrupted edits');
    const record = createWorkspace(f.state, { project: f.repo });
    await prepareWorkspace(f.state, record, new AbortController().signal);
    record.assignmentId = assignment.id;
    record.executionRunId = run.id;
    record.resolvedAssignment = { digest: 'captured-authority', context: [{ schemaVersion: 5 }] };
    record.operationInvocations = [{ id: 'uncertain', status: 'running' }];
    record.safeCheckpoint = false;
    save(f.state, record);
    host.store.updateAssignment(assignment.id, 'running', {
      recordId: record.id,
      pendingOutcome: { kind: 'completed', evidence: ['stale receipt'], receipt: 'stale' },
    });
    host.store.close();
    return { f, context, record, assignment };
  }

  /** Terminates a child immediately after durable edit intent, before its source replacement. */
  private crash(root: string, record: RecordData): void {
    const directory = join(root, 'runs', record.id, 'checked-edits');
    const authority = digest(JSON.stringify(['captured-authority', record.assignmentId]));
    const request = {
      id: 'interrupted',
      changes: [
        {
          path: 'docs/behavior.md',
          operation: 'update',
          expectedSha256: digest('Before'),
          content: 'after',
        },
      ],
    };
    const script = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
      const rename=fs.renameSync;fs.renameSync=(a,b)=>{rename(a,b);if(b.endsWith('/interrupted.json'))process.exit(85)};syncBuiltinESMExports();
      const {CheckedEdits}=await import(process.argv[1]);new CheckedEdits(process.argv[2],process.argv[3],process.argv[4],()=>{}).apply(JSON.parse(process.argv[5]));`;
    const child = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      script,
      pathToFileURL(resolve('dist/library/workspace/checked-edits.js')).href,
      record.workspace,
      directory,
      authority,
      JSON.stringify(request),
    ]);
    assert.equal(child.status, 85, child.stderr.toString());
  }
}

const scenarios = new EditRecoveryScenarios();

test('host restart finishes known edit transactions without replaying uncertain work', (t) =>
  scenarios.recovers(t, false));

test('host restart retains conflicting bytes and records edit recovery attention', (t) =>
  scenarios.recovers(t, true));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
