import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { handoffFixture } from '../development-tooling/handoff-fixture.js';
class WorkdayContextTests {
  preservesAssignmentAcceptance(t: TestContext): void {
    const f = handoffFixture(t);
    const result = f.workday();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const recipient = report.assignments.find(
      (a: any) => a.resolvedAssignment.componentId === 'dependency',
    );
    const assignment = recipient.resolvedAssignment.assignment;
    const prompt = readFileSync(join(f.state, 'runs', recipient.id, 'turns/1/prompt.txt'), 'utf8');
    const prefix = 'Authoritative assignment for this turn: ';
    const context = JSON.parse(prompt.split(prefix)[1]?.split('\n')[0] ?? 'null');
    assert.deepEqual(context, {
      objective: assignment.objective,
      criteria: assignment.acceptanceCriteria.map((text: string, index: number) => ({
        index,
        text,
      })),
    });
    assert.ok(prompt.indexOf(prefix) > prompt.indexOf('Incoming request'));
    assert.match(prompt, /Incoming request acceptance text is supplemental/);
  }
}
const suite = new WorkdayContextTests();
test('recipient plans against indexed captured acceptance after incoming request context', (t) =>
  suite.preservesAssignmentAcceptance(t));
