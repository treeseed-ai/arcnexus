import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { openBridge } from '../../dist/steward/bridge.js';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class PlanningTests {
  builtCLICapturesAReadOnlyPlanAndObservableChecklistBeforeExecution_1(t: TestContext) {
    const f = planned(t),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    assert.deepEqual(
      record.turns.map((t: any) => t.activity),
      ['planning', 'specification', 'implementation', 'review'],
    );
    assert.equal(record.plan.items[0].status, 'completed');
    assert.equal(record.plan.items[0].basis, 'agent claim');
    const dir = join(f.state, 'runs', record.id);
    assert.match(readFileSync(join(dir, 'plan.md'), 'utf8'), /\[x\]/);
    const events = readFileSync(join(dir, 'timeline.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    assert.deepEqual(
      events.map((e: any) => e.sequence),
      events.map((_: any, i: any) => i + 1),
    );
    assert.equal(events.at(-1).type, 'run.finalized');
    this.assertViewers(f.env, record.id);
  }
  private assertViewers(env: NodeJS.ProcessEnv, id: string): void {
    for (const command of ['status', 'follow']) {
      const viewed = spawnSync(process.execPath, [cli, command, id, '--json'], {
        env,
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      });
      assert.equal(viewed.status, 0, viewed.stderr);
      assert.ok(viewed.stdout.length);
    }
  }
  scenario_2(t: TestContext, mode: any) {
    const f = planned(t, mode),
      r = f.run();
    assert.equal(r.status, 1, r.stderr);
    assert.equal(JSON.parse(r.stdout).turns.length, 1);
  }
  statusRejectsEscapingRunIDs_3() {
    const r = spawnSync(process.execPath, [cli, 'status', '../../outside', '--json'], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 2);
  }
  async realStdioMCPBridgeUpdatesHostChecklistDuringATurn_4(_t: TestContext) {
    let observed: any;
    const bridge = await openBridge(
      [{ name: 'plan.update', description: 'Update checklist', inputSchema: { type: 'object' } }],
      async (name: any, args: any) => {
        observed = { name, args };
        return { status: 'recorded' };
      },
    );
    const config = (bridge.config.mcp_servers as any).arcnexus;
    const client = new Client({ name: 'acceptance', version: '1' }, { capabilities: {} });
    try {
      assert.ok(config.startup_timeout_sec >= 86400);
      assert.ok(config.tool_timeout_sec >= 86400);
      await client.connect(
        new StdioClientTransport({ command: config.command, args: config.args }),
      );
      assert.equal((await client.listTools()).tools[0]!.name, 'plan.update');
      await this.updateChecklist(client);
      assert.equal(observed.args.updates[0].status, 'completed');
    } finally {
      await client.close();
      await bridge.close();
    }
  }
  private async updateChecklist(client: Client): Promise<void> {
    await client.callTool({
      name: 'plan.update',
      arguments: {
        updates: [
          { id: 'work', status: 'completed', evidence: ['source.txt'], explanation: 'Verified' },
        ],
      },
    });
  }
  scenario_5(t: TestContext, kind: any) {
    const f = planned(t),
      r = f.run('--kind', kind);
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.turns.length, 2);
    assert.equal(v.changes.length, 0);
  }
  planningPreservesTheSingleCorrectiveAllowanceAndCumulativeUsage_6(t: TestContext) {
    const f = planned(t, 'repair'),
      r = f.run('--max-attempts', '2');
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.deepEqual(
      v.turns.map((t: any) => t.activity),
      ['planning', 'specification', 'implementation', 'correction', 'review'],
    );
    assert.equal(v.implementationAttempts, 2);
    assert.equal(v.usage.input_tokens, 50);
  }
  checklistCompletionWithoutEvidenceStopsTheAssignment_7(t: TestContext) {
    const f = planned(t);
    f.configure({ missingEvidence: true });
    const r = f.run();
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /completion requires evidence/);
  }
  async timelineReaderReportsTruncationAndHistoricalAbsence_8(t: TestContext) {
    const { readTimeline } = await import('../../dist/report/timeline.js');
    const f = workflowFixture(t);
    assert.equal(readTimeline(f.root).complete, false);
    writeFileSync(join(f.root, 'timeline.jsonl'), '{"unfinished":');
    assert.match(readTimeline(f.root).problem ?? '', /Incomplete/);
  }
  builtProductionSDKPassesExplicitMCPBridgeConfigurationToTheExecutable_9(t: TestContext) {
    const f = planned(t, 'bridge-update'),
      r = f.run();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.ok(v.plan.version >= 7);
    const events = readFileSync(join(f.state, 'runs', v.id, 'timeline.jsonl'), 'utf8');
    assert.match(events, /plan.updated/);
  }
  researchExecutesThePlanNowInsteadOfDeferringWorkToAnImaginaryLaterTurn_10(t: TestContext) {
    const f = planned(t);
    f.configure({ researchPrompt: true });
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).turns.length, 2);
  }
  builtSDKSchemaConstrainsFinalUpdatesToStewardItemsAndRejectsForgedHostCompletion_11(
    t: TestContext,
  ) {
    const f = planned(t);
    f.configure({ checkItemSchema: true });
    const r = f.run();
    assert.equal(r.status, 0, r.stderr);
    f.configure({ forgedCompletion: true });
    const bad = f.run();
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Unknown checklist item/);
  }
  planningPromptStatesActivityMembershipAndHostDiagnosesOmittedSelection_12(t: TestContext) {
    const f = planned(t);
    f.configure({ omittedActivity: true });
    const r = f.run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Checklist item work activity research is absent from plan.activities/);
  }
}
const suite = new PlanningTests();

function planned(t: any, mode: any = 'success'): any {
  const f = workflowFixture(t, mode);
  const path = join(f.repo, 'architecture/execution-profiles/luna.yaml');
  const profile = JSON.parse(String(readFileSync(path)));
  profile.schemaVersion = 2;
  profile.maxTurns = 4;
  writeFileSync(path, JSON.stringify(profile));
  f.commit();
  f.configure({ planning: true });
  return f;
}
test('built CLI captures a read-only plan and observable checklist before execution', (t: any) =>
  suite.builtCLICapturesAReadOnlyPlanAndObservableChecklistBeforeExecution_1(t));
for (const mode of ['invalid-plan', 'planning-write'])
  test(`stops ${mode} before implementation`, (t: any) => suite.scenario_2(t, mode));
test('status rejects escaping run IDs', () => suite.statusRejectsEscapingRunIDs_3());
test('real stdio MCP bridge updates host checklist during a turn', (t: any) =>
  suite.realStdioMCPBridgeUpdatesHostChecklistDuringATurn_4(t));
for (const kind of ['research', 'review'])
  test(`planned ${kind} uses two source-read-only turns`, (t: any) => suite.scenario_5(t, kind));
test('planning preserves the single corrective allowance and cumulative usage', (t: any) =>
  suite.planningPreservesTheSingleCorrectiveAllowanceAndCumulativeUsage_6(t));
test('checklist completion without evidence stops the assignment', (t: any) =>
  suite.checklistCompletionWithoutEvidenceStopsTheAssignment_7(t));
test('timeline reader reports truncation and historical absence', (t: any) =>
  suite.timelineReaderReportsTruncationAndHistoricalAbsence_8(t));

test('built production SDK passes explicit MCP bridge configuration to the executable', (t: any) =>
  suite.builtProductionSDKPassesExplicitMCPBridgeConfigurationToTheExecutable_9(t));

test('research executes the plan now instead of deferring work to an imaginary later turn', (t: any) =>
  suite.researchExecutesThePlanNowInsteadOfDeferringWorkToAnImaginaryLaterTurn_10(t));

test('built SDK schema constrains final updates to steward items and rejects forged host completion', (t: any) =>
  suite.builtSDKSchemaConstrainsFinalUpdatesToStewardItemsAndRejectsForgedHostCompletion_11(t));

test('planning prompt states activity membership and host diagnoses omitted selection', (t: any) =>
  suite.planningPromptStatesActivityMembershipAndHostDiagnosesOmittedSelection_12(t));
