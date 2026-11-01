import { milliseconds } from '../architecture/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ResolvedAssignment } from '../architecture/assignment.js';
import { targetCommand } from '../architecture/bindings.js';
import type { Command } from '../architecture/config.js';
import { observe } from '../report/timeline.js';
import { openBridge, protocolTimeoutSeconds } from '../steward/bridge.js';
import { save, type RecordData } from '../workspace/state.js';
import { assertIdentity, assertOutputs } from '../workspace/workspace.js';
import { operationEnvironment, type Operation } from './operations.js';
import { execute } from './process.js';

export async function prepareCapabilities(
  root: string,
  record: RecordData,
  signal: AbortSignal,
): Promise<void> {
  const resolved = record.resolvedAssignment as ResolvedAssignment;
  if (resolved.executionProfile.schemaVersion < 2) return;
  await new CapabilityProbes(root, record, signal, resolved).run();
}

class CapabilityProbes {
  private readonly probes: unknown[] = [];
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
    private readonly resolved: ResolvedAssignment,
  ) {
    record.probes = this.probes;
    record.stage = 'capability-probes';
  }

  async run(): Promise<void> {
    const seen = new Set<string>();
    for (const op of this.resolved.operations)
      for (const probe of op.probes) {
        const key = JSON.stringify([op.cwd, probe]);
        if (seen.has(key)) continue;
        seen.add(key);
        await this.hostProbe(op, probe);
      }
    await new BridgeProbe(this.root, this.record, this.signal, this.probes).run();
  }

  private async hostProbe(op: Operation, probe: Command): Promise<void> {
    const { root, record, signal, probes } = this;
    signal.throwIfAborted();
    const cwd = realpathSync(join(record.workspace, op.cwd));
    if (relative(record.workspace, cwd).startsWith('..'))
      throw new Error('Probe working directory escapes workspace');
    observe(root, record, 'probe.started', { operationId: op.id, command: probe, cwd });
    try {
      const result = await this.command(probe, cwd);
      probes.push({ operationId: op.id, route: 'host', ...result });
      observe(root, record, 'probe.completed', result);
    } catch (error) {
      const result =
        error && typeof error === 'object' && 'commandResult' in error
          ? error.commandResult
          : undefined;
      probes.push({ operationId: op.id, route: 'host', result, error: String(error) });
      observe(root, record, 'probe.failed', probes.at(-1));
      throw error;
    } finally {
      save(root, record);
      assertIdentity(record);
      assertOutputs(record.workspace, record.environment);
    }
  }

  private command(probe: Command, cwd: string) {
    const { root, record, signal, probes, resolved } = this;
    return execute(
      targetCommand(record, probe),
      cwd,
      join(root, 'runs', record.id, `probe-${probes.length}.log`),
      signal,
      {
        env: operationEnvironment(record),
        timeoutMs: milliseconds(resolved.executionProfile.commandTimeoutSeconds),
      },
    );
  }
}

class BridgeProbe {
  private readonly client = new Client(
    { name: 'arcnexus-capability-probe', version: '1' },
    { capabilities: {} },
  );
  private readonly abort = () => {
    void this.client.close();
  };
  private readonly start = Date.now();

  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
    private readonly probes: unknown[],
  ) {}

  async run(): Promise<void> {
    const bridge = await openBridge(
      [{ name: 'probe', description: 'Connectivity probe', inputSchema: { type: 'object' } }],
      async () => ({ ok: true }),
    );
    this.signal.addEventListener('abort', this.abort, { once: true });
    try {
      await this.check(bridge.config);
      this.passed();
    } catch (error) {
      this.failed(error);
      throw error;
    } finally {
      this.signal.removeEventListener('abort', this.abort);
      await this.client.close();
      await bridge.close();
      save(this.root, this.record);
    }
  }

  private async check(configuration: Record<string, unknown>): Promise<void> {
    const config = (configuration.mcp_servers as { arcnexus: { command: string; args: string[] } })
      .arcnexus;
    this.signal.throwIfAborted();
    await this.client.connect(
      new StdioClientTransport({ command: config.command, args: config.args }),
      { timeout: protocolTimeoutSeconds * 1000 },
    );
    const result = await this.client.callTool({ name: 'probe', arguments: {} }, undefined, {
      timeout: protocolTimeoutSeconds * 1000,
    });
    this.signal.throwIfAborted();
    if (result.isError) throw new Error('Bridge functional probe failed');
  }

  private passed(): void {
    const evidence = {
      route: 'stdio-mcp',
      status: 'passed',
      durationMs: Date.now() - this.start,
      transport: 'ArcNexus bridge',
      runtime: process.version,
    };
    this.probes.push(evidence);
    observe(this.root, this.record, 'probe.completed', evidence);
  }

  private failed(error: unknown): void {
    this.probes.push({
      route: 'stdio-mcp',
      status: 'failed',
      error: String(error),
      durationMs: Date.now() - this.start,
    });
    observe(this.root, this.record, 'probe.failed', this.probes.at(-1));
  }
}
