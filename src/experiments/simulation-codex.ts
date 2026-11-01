import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ConfigurationReader } from '../architecture/configuration.js';
import type { AgentResult } from '../steward/codex.js';
import type { Scenario } from './experiment-config.js';
class SimulationCodex {
  private readonly scenario = process.argv[2] as Scenario;
  private readonly args = process.argv.slice(3);
  private stage?: string;
  private readonly result: AgentResult = {
    status: 'completed',
    summary: 'SIMULATED fixed scenario ' + this.scenario,
    blockers: [],
    findings: [
      {
        summary: 'SIMULATED fixture observation',
        evidence: ['source.txt'],
        uncertainty: 'Scripted behavior does not establish model capability',
      },
    ],
    activities: [],
    regression: null,
    reviewFindings: [],
    requests: [],
    plan: null,
    planUpdates: [],
  };
  async run(): Promise<void> {
    this.prepare();
    let prompt = '';
    for await (const chunk of process.stdin) prompt += chunk;
    this.stage = prompt.match(/Activity turn: ([a-z-]+)/)?.[1];
    this.emit({
      type: 'thread.started',
      thread_id:
        'simulation-' + createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16),
    });
    if (this.stage === 'planning') this.plan();
    else if (this.scenario === 'boundary') this.boundary();
    else if (this.scenario === 'failure' && this.stage === 'implementation') {
      this.emit({ type: 'turn.failed', error: { message: 'SIMULATED execution failure' } });
      return;
    } else await this.execute();
    this.emit({
      type: 'item.completed',
      item: { id: 'simulation-result', type: 'agent_message', text: JSON.stringify(this.result) },
    });
    this.emit({
      type: 'turn.completed',
      usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
    });
  }
  private prepare(): void {
    if (!['success', 'repair', 'boundary', 'failure'].includes(this.scenario))
      throw new Error('Unknown fixed simulation scenario');
    if (this.args[0] === '--version') {
      console.log('ArcNexus controlled simulation (no model)');
      process.exit(0);
    }
    if (this.args[0] === 'sandbox') process.exit(0);
    if (this.args[0] !== 'exec' || !this.args.includes('--ignore-user-config'))
      throw new Error('Expected production launcher contract');
    const cwd = this.args[this.args.indexOf('--cd') + 1];
    if (!cwd) throw new Error('Missing workspace');
    process.chdir(cwd);
    if (
      (new ConfigurationReader().file('simulation-contract.yaml').value as { id: string }).id !==
      'single-steward-v1'
    )
      throw new Error('Incompatible simulation fixture');
  }
  private plan(): void {
    this.result.plan = {
      approach: 'SIMULATED bounded fixture change',
      assumptions: ['Controlled fixture'],
      activities: [{ activity: 'implementation', reason: 'Scripted assignment' }],
      items: [
        {
          id: 'work',
          activity: 'implementation',
          result: 'Verified fixture change',
          criteria: [0],
          expectedEvidence: ['verify'],
          dependencies: [],
          status: 'pending',
          evidence: [],
          explanation: '',
        },
      ],
      questions: [],
    };
  }
  private boundary(): void {
    this.result.status = 'blocked';
    this.result.blockers = ['SIMULATED dependency contract boundary'];
    this.result.requests = [
      {
        fromComponent: 'sample',
        ownerId: 'dependency',
        request: 'Provide the required contract before implementation',
        evidence: ['contract.txt'],
        acceptanceCriteria: ['Owner supplies the requested contract'],
        reason: 'Contract belongs to dependency; current scope excludes contract.txt',
      },
    ];
  }
  private specification(): void {
    writeFileSync('docs/behavior.md', 'SIMULATED: source must become after.\n');
    writeFileSync(
      'tests/regression.mjs',
      "import assert from 'node:assert/strict';import{readFileSync}from'node:fs';assert.equal(readFileSync('source.txt','utf8'),'after','SIMULATION_EXPECTED_AFTER');\n",
    );
    this.result.regression = {
      verificationIndex: 0,
      exitCode: 1,
      outputIncludes: 'SIMULATION_EXPECTED_AFTER',
    };
  }
  private async execute(): Promise<void> {
    this.edit();
    const client = new Client({ name: 'arcnexus-simulation', version: '1' }, { capabilities: {} });
    await client.connect(
      new StdioClientTransport({
        command: this.option('command'),
        args: this.option('args'),
      }),
    );

    try {
      await client.listTools();
      const operation = await client.callTool({
        name: 'operations.run',
        arguments: { id: 'verify' },
      });
      if (operation.isError) throw new Error('Simulation operation denied');
      if (
        this.stage === 'correction' ||
        this.stage === 'review' ||
        (this.stage === 'implementation' && this.scenario !== 'repair')
      )
        await this.feedback(client);
    } finally {
      await client.close();
    }
  }
  private edit(): void {
    if (this.stage === 'specification') this.specification();
    if (this.stage === 'implementation' || this.stage === 'correction')
      writeFileSync(
        'source.txt',
        this.scenario === 'repair' && this.stage === 'implementation' ? 'broken' : 'after',
      );
  }
  private async feedback(client: Client): Promise<void> {
    const update = await client.callTool({
      name: 'plan.update',
      arguments: {
        updates: [
          {
            id: 'work',
            status: 'completed',
            explanation: 'SIMULATED source and real verification observed',
            evidence: ['source.txt', 'operation:verify'],
          },
        ],
      },
    });
    if (update.isError) throw new Error('Simulation checklist update denied');
  }
  private option(name: 'command'): string;
  private option(name: 'args'): string[];
  private option(name: 'command' | 'args'): string | string[] {
    const prefix = 'mcp_servers.arcnexus.' + name + '=',
      value = this.args.find((arg) => arg.startsWith(prefix));
    if (!value) throw new Error('Missing production bridge configuration');
    const parsed: unknown = JSON.parse(value.slice(prefix.length));
    if (name === 'command' && typeof parsed === 'string') return parsed;
    if (
      name === 'args' &&
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
    )
      return parsed as string[];
    throw new Error('Invalid bridge configuration');
  }

  private emit(value: unknown): void {
    console.log(JSON.stringify(value));
  }
}
await new SimulationCodex().run();
