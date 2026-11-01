import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { appendFileSync, writeFileSync } from 'node:fs';
import type { WorkflowOptions, WorkflowTurn } from './controlled-workflow.js';
export class ControlledPlanning {
  constructor(private options: WorkflowOptions) {}
  async apply(turn: WorkflowTurn): Promise<void> {
    this.strictSchema(turn.schema);
    turn.result.plan = null;
    turn.result.planUpdates = [];
    if (turn.stage === 'planning') this.plan(turn);
    else {
      this.checkExecutionPrompt(turn);
      turn.result.planUpdates = [this.update()];
      if (this.options.mode === 'bridge-update') await this.bridgeUpdate(turn);
      if (this.options.parallelOperations) await this.parallelOperations(turn);
      else if (this.options.operations)
        for (let i = 0; i < (this.options.operationRepeats ?? 1); i++) await this.operation(turn);
    }
  }
  private strictSchema(schema: any): void {
    if (!schema || typeof schema !== 'object') return;
    if (
      schema.properties &&
      Object.keys(schema.properties).some((key) => !schema.required?.includes(key))
    )
      throw new Error('STRICT_REQUIRED');
    if (schema.uniqueItems !== undefined) throw new Error('STRICT_UNIQUE_ITEMS');
    Object.values(schema).forEach((value) =>
      Array.isArray(value)
        ? value.forEach((item) => this.strictSchema(item))
        : this.strictSchema(value),
    );
  }
  private plan(turn: WorkflowTurn): void {
    if (this.options.mode === 'planning-write') writeFileSync('source.txt', 'bad');
    if (
      this.options.omittedActivity &&
      !turn.prompt.includes('Every checklist item activity must also appear in plan.activities')
    )
      throw new Error('ACTIVITY_MEMBERSHIP_REQUIRED');
    turn.result.plan = {
      approach: 'Check bounded behavior',
      assumptions: [],
      activities: [{ activity: 'implementation', reason: 'Apply objective' }],
      items: [
        {
          id: 'work',
          activity: this.options.omittedActivity ? 'research' : 'implementation',
          result: 'Verified objective',
          criteria: [this.options.mode === 'invalid-plan' ? 99 : 0],
          expectedEvidence: ['verification'],
          dependencies: [],
          status: 'pending',
          evidence: [],
          explanation: '',
        },
      ],
      questions: [],
    };
  }
  private update() {
    return {
      id: this.options.forgedCompletion ? 'final-verification' : 'work',
      status: 'completed',
      explanation: 'Observed change and verification',
      evidence: this.options.missingEvidence ? [] : ['source.txt'],
    };
  }
  private checkExecutionPrompt(turn: WorkflowTurn): void {
    if (
      this.options.checkItemSchema &&
      JSON.stringify(turn.schema.properties.planUpdates.items.properties.id.enum) !==
        JSON.stringify(['work'])
    )
      throw new Error('STEWARD_ITEM_SCHEMA_REQUIRED');
    if (
      this.options.researchPrompt &&
      turn.stage === 'research' &&
      !turn.prompt.includes('This is the only execution turn')
    ) {
      turn.result.status = 'failed';
      turn.result.blockers = ['Deferred operations to an imaginary later execution turn'];
    }
  }
  private async bridgeUpdate(turn: WorkflowTurn): Promise<void> {
    const reply = await this.call(turn, 'plan.update', {
      updates: [
        {
          id: 'work',
          status: 'completed',
          explanation: 'Observed through bridge',
          evidence: ['source.txt'],
        },
      ],
    });
    if (reply.isError) throw new Error(JSON.stringify(reply));
  }
  private async operation(turn: WorkflowTurn): Promise<void> {
    if (!turn.args.includes('mcp_servers.arcnexus.default_tools_approval_mode="approve"'))
      throw new Error('EXPLICIT_BRIDGE_APPROVAL_MISSING');
    const reply = this.options.managedService
      ? await this.withClient(turn, (client) => this.service(client))
      : await this.call(turn, 'operations.run', {
          id: this.options.mode === 'denied' ? 'unknown' : 'test',
        });
    appendFileSync(this.options.operations!, JSON.stringify(reply) + '\n');
  }
  private async parallelOperations(turn: WorkflowTurn): Promise<void> {
    const replies = await this.withClient(turn, (client) =>
      Promise.all(
        [0, 1].map(() =>
          this.request(client, {
            name: 'operations.run',
            arguments: { id: 'test' },
          }),
        ),
      ),
    );
    for (const reply of replies)
      appendFileSync(this.options.operations!, JSON.stringify(reply) + '\n');
  }
  private async service(client: Client) {
    const started = await this.request(client, {
      name: 'services.start',
      arguments: { id: 'test' },
    });
    if (started.isError) throw new Error(JSON.stringify(started));
    if (this.options.holdService)
      await new Promise(() => {
        setInterval(() => {}, 1000);
      });
    const reply = await this.request(client, {
      name: 'operations.run',
      arguments: { id: 'http-check' },
    });
    if (reply.isError) throw new Error(JSON.stringify(reply));
    await this.request(client, { name: 'services.logs', arguments: { id: 'test' } });
    await this.request(client, { name: 'services.status', arguments: { id: 'test' } });
    if (this.options.delayedServiceExit) await new Promise((resolve) => setTimeout(resolve, 800));
    return reply;
  }
  private async call(turn: WorkflowTurn, name: string, args: Record<string, unknown>) {
    return this.withClient(turn, (client) => this.request(client, { name, arguments: args }));
  }
  private async request(
    client: Client,
    params: { name: string; arguments: Record<string, unknown> },
  ): Promise<any> {
    let reply: any = await client.callTool(params);
    while (!reply.isError) {
      const result = JSON.parse(reply.content[0].text);
      if (result.status !== 'pending') break;
      if (this.options.operations)
        appendFileSync(this.options.operations + '.pending', result.requestId + '\n');
      reply = await client.callTool({
        name: 'execution.wait',
        arguments: { requestId: result.requestId },
      });
    }
    return reply;
  }
  private async withClient<T>(
    turn: WorkflowTurn,
    action: (client: Client) => Promise<T>,
  ): Promise<T> {
    const option = (key: string) =>
      JSON.parse(
        turn.args
          .find((arg) => arg.startsWith('mcp_servers.arcnexus.' + key + '='))!
          .split('=')
          .slice(1)
          .join('='),
      );
    const client = new Client({ name: 'controlled-codex', version: '1' }, { capabilities: {} });
    try {
      await client.connect(
        new StdioClientTransport({ command: option('command'), args: option('args') }),
      );
      return await action(client);
    } finally {
      await client.close();
    }
  }
}
