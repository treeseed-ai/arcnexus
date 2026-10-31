import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import { targetCommand } from '../architecture/bindings.js';
import type { Command } from '../architecture/config.js';
import { observe } from '../report/timeline.js';
import type { BridgeTool } from '../steward/bridge.js';
import { save, type RecordData } from '../workspace/state.js';
import { operationEnvironment } from './environment.js';
import { execute, type CommandResult } from './process.js';
import { ServiceManager, type HttpDefinition, type ServiceDefinition } from './services.js';
export { operationEnvironment } from './environment.js';
export type Operation = {
  schemaVersion: 2;
  id: string;
  purpose: string;
  repository: string;
  cwd: string;
  category: string;
  activities: string[];
  timeoutSeconds: number;
  generatedDirectories: string[];
  artifacts: string[];
  probes: Command[];
} & (
  | (Command & { kind: 'command' | 'service'; service?: ServiceDefinition })
  | { kind: 'http'; http: HttpDefinition }
);
export interface OperationBridge {
  tools: BridgeTool[];
  call: (name: string, args: unknown) => Promise<unknown>;
  disconnect: () => void;
  close: () => Promise<void>;
}
export function operationBridge(
  root: string,
  record: RecordData,
  signal: AbortSignal,
  inspect: () => void,
): OperationBridge {
  const runtime = new OperationRuntime(root, record, signal, inspect);
  return {
    tools: operationTools(),
    call: (name, args) => runtime.call(name, args),
    close: () => runtime.close(),
    disconnect: () => runtime.disconnect(),
  };
}

class OperationRuntime {
  private readonly resolved: ResolvedAssignment;
  private readonly services: ServiceManager;
  private active: AbortController | undefined;

  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
    private readonly inspect: () => void,
  ) {
    this.resolved = record.resolvedAssignment as ResolvedAssignment;
    this.services = new ServiceManager(root, record, signal);
    record.operations ??= [];
    record.operationCalls ??= 0;
  }

  close(): Promise<void> {
    return this.services.stop();
  }

  disconnect(): void {
    this.active?.abort(new Error('Operation bridge disconnected'));
    void this.services.stop().catch(() => {});
  }

  async call(name: string, args: unknown): Promise<unknown> {
    if (name === 'operations.list') return this.list(args);
    const op = this.authorize(name, args);
    if (name.startsWith('services.')) {
      const result = await this.service(name, op);
      this.inspect();
      return result;
    }
    if (op.kind === 'service') throw new Error('Use services.start for service operations');
    return this.finite(op);
  }

  private list(args: unknown) {
    if (args && Object.keys(args).length) throw new Error('Operation listing accepts no arguments');
    return {
      operations: this.resolved.operations,
      budget: this.resolved.executionProfile.maxOperationCalls ?? 24,
      used: this.record.operationCalls,
    };
  }

  private authorize(name: string, args: unknown): Operation {
    const { root, record, resolved } = this;
    this.request(args);
    if (
      !args ||
      typeof args !== 'object' ||
      Object.keys(args).length !== 1 ||
      typeof (args as { id?: unknown }).id !== 'string'
    )
      throw new Error('Operation requires only an ID');
    const id = (args as { id: string }).id,
      op = resolved.operations.find((op) => op.id === id);
    if (!op) throw new Error('Unknown or denied operation: ' + id);
    const stage = String(record.stage);
    const activities =
      stage === 'specification'
        ? ['research', 'documentation', 'testing']
        : stage === 'correction'
          ? ['implementation']
          : stage === 'planning'
            ? ['research']
            : [stage];
    if (!op.activities.some((a) => activities.includes(a)))
      throw new Error('Operation activity denied: ' + stage);
    observe(root, record, 'operation.authorized', {
      id,
      tool: name,
      stage,
      number: record.operationCalls,
    });
    return op;
  }

  private request(args: unknown): void {
    const { root, record, resolved } = this;
    record.operationCalls = Number(record.operationCalls) + 1;
    observe(root, record, 'operation.requested', { number: record.operationCalls, args });
    save(root, record);
    if (Number(record.operationCalls) > (resolved.executionProfile.maxOperationCalls ?? 24))
      throw new Error('Operation request budget exhausted');
  }

  private async service(name: string, op: Operation): Promise<unknown> {
    switch (name) {
      case 'services.start':
        return this.services.start(op);
      case 'services.status':
        return this.services.status(op.id);
      case 'services.logs':
        return this.services.logs(op.id);
      case 'services.stop':
        this.services.status(op.id);
        await this.services.stop();
        return { status: 'stopped' };
      default:
        throw new Error('Unknown service action');
    }
  }

  private begin(op: Operation): { cwd: string; combined: AbortSignal; start: number } {
    if (this.active) throw new Error('Concurrent operation denied');
    const cwd = realpathSync(join(this.record.workspace, op.cwd));
    const path = relative(this.record.workspace, cwd);
    if (path.startsWith('..') || path.startsWith('/'))
      throw new Error('Operation working directory escapes workspace');
    this.active = new AbortController();
    const combined = AbortSignal.any([this.signal, this.active.signal]),
      start = Date.now();
    this.record.currentOperation = op.id;
    observe(this.root, this.record, 'operation.started', {
      id: op.id,
      number: this.record.operationCalls,
      cwd,
    });
    save(this.root, this.record);
    return { cwd, combined, start };
  }

  private async finite(op: Operation): Promise<unknown> {
    const { cwd, combined, start } = this.begin(op);
    const outcome: { result?: CommandResult } = {};
    let artifacts: unknown[] = [];
    try {
      outcome.result = await this.execute(op, cwd, combined, outcome);
      const result = outcome.result;
      this.inspect();
      artifacts = op.artifacts.map((path) => this.artifact(path));
      const output = readFileSync(result!.log).subarray(0, 16384).toString('utf8');
      return {
        id: op.id,
        status: result!.exitCode === 0 ? 'passed' : 'failed',
        ...result,
        output,
        artifacts,
      };
    } finally {
      this.finish(op.id, start, outcome.result, artifacts);
    }
  }

  private async execute(
    op: Operation,
    cwd: string,
    signal: AbortSignal,
    outcome: { result?: CommandResult },
  ): Promise<CommandResult | undefined> {
    try {
      return await this.command(op, cwd, signal);
    } catch (error) {
      if (error && typeof error === 'object' && 'commandResult' in error)
        outcome.result = error.commandResult as CommandResult;
      if (!(error instanceof Error) || !error.message.startsWith('Command failed (')) throw error;
      return outcome.result;
    }
  }

  private async command(op: Operation, cwd: string, signal: AbortSignal): Promise<CommandResult> {
    const { root, record, resolved } = this;
    const log = join(root, 'runs', record.id, `operation-${record.operationCalls}.log`);
    if (op.kind === 'http')
      return this.services.check(
        op,
        log,
        AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.max(1, Math.floor(op.timeoutSeconds * 1000))),
        ]),
      );
    const command = targetCommand(record, {
      command: op.command,
      args: op.args.map((a) => (a === '{workspace}' ? record.workspace : a)),
    });
    return execute(command, cwd, log, signal, {
      env: operationEnvironment(record),
      timeoutMs:
        Math.min(op.timeoutSeconds, resolved.executionProfile.commandTimeoutSeconds) * 1000,
    });
  }

  private artifact(path: string) {
    const { root, record } = this;
    const source = join(record.workspace, path);
    if (!lstatSync(source).isFile() || realpathSync(source) !== source)
      throw new Error('Operation artifact must be a regular non-symlink file');
    const bytes = readFileSync(source);
    if (bytes.length > 64 * 1024 * 1024) throw new Error('Operation artifact limit exceeded');
    const dir = join(root, 'runs', record.id, 'operation-artifacts', String(record.operationCalls));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const sha256 = digest(bytes);
    writeFileSync(join(dir, sha256), bytes, { mode: 0o600 });
    return { path, sha256, artifact: relative(join(root, 'runs', record.id), join(dir, sha256)) };
  }

  private finish(
    id: string,
    start: number,
    result: CommandResult | undefined,
    artifacts: unknown[],
  ): void {
    const { root, record } = this;
    if (result) (record.operations as unknown[]).push({ id, ...result, artifacts });
    observe(root, record, 'operation.finished', {
      id,
      durationMs: Date.now() - start,
      result,
      artifacts,
    });
    delete record.currentOperation;
    this.active = undefined;
    save(root, record);
    this.inspect();
  }
}
function operationTools(): BridgeTool[] {
  const tools: BridgeTool[] = [
    {
      name: 'operations.list',
      description: 'List captured engineering operations and their fixed commands.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'operations.run',
      description:
        'Execute one declared operation by ID and receive actual output. Nonzero tests are evidence, not transport failures.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  ];
  return [...tools, ...serviceTools()];
}

function serviceTools(): BridgeTool[] {
  const tools: BridgeTool[] = [];
  for (const action of ['start', 'status', 'logs', 'stop'])
    tools.push({
      name: 'services.' + action,
      description: 'Manage a declared local HTTP service lease: ' + action,
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    });
  return tools;
}
