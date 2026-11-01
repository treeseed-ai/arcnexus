import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
class OperationCampaignAcceptance {
  private record: any;
  constructor(
    path: string,
    private kind: string,
  ) {
    this.record = JSON.parse(readFileSync(path, 'utf8'));
  }
  run(): void {
    const record = this.record;
    assert.equal(record.status, 'completed');
    assert.equal(record.settings.model, 'gpt-6-luna');
    assert.equal(record.settings.reasoning, 'medium');
    assert.ok(
      record.plan.items.every((item: any) => ['completed', 'skipped'].includes(item.status)),
    );
    assert.ok(record.plan.hostChecks.every((item: any) => item.status === 'completed'));
    assert.ok(record.turns.every((turn: any) => turn.threadId === record.threadId));
    assert.ok(record.turns.length <= (this.kind === 'repair' ? 6 : this.kind === 'change' ? 4 : 2));
    assert.ok(
      record.operations.some((operation: any) => operation.exitCode === 0),
      'actual operation feedback required',
    );
    assert.ok(
      record.services.every(
        (service: any) => service.status === 'stopped' && service.endpointClosed === true,
      ),
    );
    this.outcome();
    if (this.kind === 'repair') this.repair();
    if (this.kind === 'http') assert.ok(record.services.length > 0);
    if (this.kind === 'history') assert.ok(record.resolvedAssignment.priorEvidence.length > 0);
    if (this.kind === 'tree') assert.equal(record.members.length, 2);
    console.log('QUALIFIED_' + this.kind);
  }
  private outcome(): void {
    const record = this.record;
    if (this.kind === 'change' || this.kind === 'repair') {
      assert.equal(record.outcome, 'ready_for_integration');
      assert.ok(
        record.changes.some((change: any) =>
          ['src/library/report/report.ts', 'src/report.ts'].includes(change.path),
        ),
      );
      assert.ok(record.regressionCheckpoint);
      assert.ok(record.commands.some((command: any) => command.exitCode !== 0));
    } else {
      assert.equal(record.changes.length, 0);
      assert.ok(record.agent.findings.length);
    }
  }
  private repair(): void {
    const record = this.record;
    assert.equal(record.implementationAttempts, 2);
    assert.ok(record.turns.some((turn: any) => turn.activity === 'correction'));
    assert.ok(
      record.commands.some((command: any) =>
        readFileSync(command.log, 'utf8').includes('FAULT_INJECTED'),
      ),
    );
    const checks = record.commands.filter((command: any) =>
      /\/inject-report-defect\.(mjs|js)$/.test(command.args[0] ?? ''),
    );
    assert.ok(
      checks.some((check: any) => check.exitCode === 1) && checks.at(-1).exitCode === 0,
      'unchanged independent check failed then passed',
    );
    const marker = JSON.parse(
      readFileSync(checks[0].args[1] + '.' + basename(record.workspace), 'utf8'),
    );
    const actual = createHash('sha256')
      .update(readFileSync(join(record.workspace, marker.path)))
      .digest('hex');
    assert.notEqual(marker.before, marker.after);
    assert.notEqual(actual, marker.after, 'Luna changed the injected implementation');
  }
}
new OperationCampaignAcceptance(process.argv[2]!, process.argv[3]!).run();
