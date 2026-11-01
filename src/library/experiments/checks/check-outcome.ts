import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
class OutcomeAcceptance {
  private record: any;
  constructor(
    path: string,
    private kind: string,
  ) {
    this.record = JSON.parse(readFileSync(path, 'utf8'));
  }
  run(): void {
    assert.equal(this.record.settings.model, 'gpt-6-luna');
    assert.equal(this.record.settings.reasoning, 'medium');
    assert.equal(this.record.usageComplete, true);
    assert.ok(this.record.turns.length > 0);
    if (this.kind === 'boundary') this.boundary();
    else if (this.kind === 'research' || this.kind === 'review') this.readOnly();
    else this.change();
    console.log(
      'Independent ' +
        this.kind +
        ' outcome acceptance passed; findings still require caller review',
    );
  }
  private boundary(): void {
    const record = this.record;
    assert.equal(record.outcome, 'blocked');
    assert.equal(record.changes.length, 0);
    const request = record.requests.find((request: any) => request.ownerId === 'sdk-contracts');
    assert.ok(request, 'SDK contract owner must be named');
    assert.equal(request.fromComponent, 'artifact-diagnostics');
    assert.ok(
      request.evidence.length && request.acceptanceCriteria.length && request.reason.length,
    );
    assert.match(JSON.stringify(request), /schema|contract|interface/i);
  }
  private readOnly(): void {
    const record = this.record;
    assert.equal(record.outcome, this.kind + '_completed');
    assert.equal(record.changes.length, 0);
    assert.equal(record.turns.length, 1);
    assert.ok(record.agent.findings.length);
    assert.ok(record.agent.findings.every((finding: any) => finding.evidence.length > 0));
    if (this.kind === 'research')
      assert.match(JSON.stringify(record.agent.findings), /architecture/);
  }
  private change(): void {
    const record = this.record;
    assert.equal(record.outcome, 'ready_for_integration');
    assert.ok(record.changes.length > 0);
    assert.ok(
      record.commands.some((command: any) => command.exitCode !== 0),
      'Expected red test must be recorded',
    );
    if (this.kind === 'repair') this.repair();
  }
  private repair(): void {
    const record = this.record;
    assert.equal(record.implementationAttempts, 2);
    assert.ok(record.turns.some((turn: any) => turn.activity === 'correction'));
    const logs: string[] = record.commands.map((command: any) => readFileSync(command.log, 'utf8'));
    assert.ok(
      logs.some(
        (log) => log.includes('FAULT_INJECTED:') && log.includes('VERIFIED_OUTCOME_REQUIRED'),
      ),
    );
    assert.ok(
      logs.some(
        (log) =>
          log.includes('FAULT_REPAIR_OBSERVED:') &&
          log.includes('Independent activity/outcome summary acceptance passed'),
      ),
    );
    assert.doesNotMatch(
      readFileSync(
        record.workspace +
          (existsSync(record.workspace + '/src/library/report/report.ts')
            ? '/src/library/report/report.ts'
            : '/src/report.ts'),
        'utf8',
      ),
      /INJECTED_WRONG_OUTCOME/,
    );
  }
}
new OutcomeAcceptance(process.argv[2]!, process.argv[3]!).run();
