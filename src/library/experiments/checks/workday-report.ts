import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
class WorkdayReportAcceptance {
  run(path: string): void {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(report.status, 'completed');
    assert.equal(report.assignments.length, 2);
    assert.equal(new Set(report.assignments.map((assignment: any) => assignment.threadId)).size, 2);
    assert.ok(report.messages.some((message: any) => message.kind === 'request'));
    assert.ok(report.messages.some((message: any) => message.payload.decision === 'accepted'));
    assert.ok(report.messages.some((message: any) => message.payload.decision === 'delivered'));
    assert.ok(report.events.some((event: any) => event.type === 'assignment.resumed'));
    assert.equal(report.parking.status, 'restored');
    for (const assignment of report.assignments) this.assignment(assignment);
  }
  private assignment(value: any): void {
    assert.equal(value.status, 'completed');
    const seconds =
      value.executionLimits?.timeoutSeconds ??
      value.resolvedAssignment?.executionProfile?.timeoutSeconds;
    if (seconds !== undefined)
      assert.ok(value.activeMs <= seconds * 1000, 'Explicit active-time limit exceeded');
    assert.equal(value.callerInterventions.length, 0);
    assert.ok(value.turns.every((turn: any) => turn.threadId === value.threadId));
    assert.ok(
      (value.services ?? []).every(
        (service: any) => service.stoppedAt || service.status === 'stopped',
      ),
    );
  }
}
new WorkdayReportAcceptance().run(process.argv[2]!);
