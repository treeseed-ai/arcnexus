import type { SourceConfinement } from './confinement.js';
import { OperationArtifacts, type OperationArtifact } from './operation-artifacts.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { targetCommand } from '../architecture/bindings.js';
import { observe } from '../report/timeline.js';
import { save, type RecordData } from '../workspace/state.js';
import { OperationConfinement } from './operation-confinement.js';
import { operationEnvironment } from './environment.js';
import { currentOperationContext } from './current-context.js';
import type { Operation } from './operations.js';
import { execute, type CommandResult } from './process.js';

interface Invocation {
  id: string;
  operationId: string;
  runId: string;
  assignmentId?: unknown;
  command: string;
  arguments: string[];
  cwd: string;
  artifacts: OperationArtifact[];
  artifactErrors: string[];
  definitionDigest: string;
  purpose: string;
  context: unknown;
  selectedTests?: Operation['selectedTests'];
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result?: CommandResult;
  error?: string;
}

/** Executes captured finite operations through source confinement and the existing process supervisor. */
export class OperationExecution {
  /** Binds operation evidence and cancellation to the active host-owned run record. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
  ) {}

  /** Records intent before dispatch and keeps agent use distinct from required checkpoint evidence. */
  async run(op: Operation, purpose: string): Promise<CommandResult> {
    if (
      op.kind !== 'command' ||
      op.schemaVersion !== 4 ||
      op.argumentTokens ||
      !op.definitionDigest ||
      !op.resolvedContext
    )
      throw new Error('A finite captured operation with resolved host context is required');
    this.assertSettled();
    this.signal.throwIfAborted();
    op = currentOperationContext(this.record, op);
    const adapter = await new OperationConfinement(this.root, this.record, this.signal).prepare(op);
    const invocation = this.begin(op, purpose);
    try {
      invocation.result = await this.command(op, adapter, invocation.id);
      invocation.status = 'completed';
      return invocation.result;
    } catch (error) {
      this.failed(invocation, error);
      throw error;
    } finally {
      this.finish(invocation, op);
    }
  }

  /** Sends resolved argv through the same confined process supervisor for every invocation purpose. */
  private async command(
    op: Extract<Operation, { command: string }>,
    adapter: SourceConfinement,
    id: string,
  ): Promise<CommandResult> {
    const command = adapter.command(
      targetCommand(this.record, op),
      join(this.record.workspace, op.cwd),
    );
    const result = await execute(
      command,
      realpathSync(join(this.record.workspace, op.cwd)),
      join(this.root, 'runs', this.record.id, `invocation-${id}.log`),
      this.signal,
      { env: adapter.environment(operationEnvironment(this.record)), fileOutput: true },
    );
    return { ...result, command: op.command, args: op.args };
  }

  /** Refuses uncertain prior execution rather than repeating a command after host loss. */
  private assertSettled(): void {
    const invocations = (this.record.operationInvocations ?? []) as Invocation[];
    if (invocations.some((item) => item.status === 'running' || item.status === 'interrupted'))
      throw new Error('Operation completion is uncertain; inspect retained invocation evidence');
  }

  /** Persists operation identity and resolved context before starting managed execution. */
  private begin(op: Extract<Operation, { command: string }>, purpose: string): Invocation {
    const invocation: Invocation = {
      id: randomUUID(),
      operationId: op.id,
      runId: this.record.id,
      assignmentId: this.record.assignmentId,
      command: targetCommand(this.record, op).command,
      arguments: [...op.args],
      cwd: join(this.record.workspace, op.cwd),
      artifacts: [],
      artifactErrors: [],
      definitionDigest: op.definitionDigest!,
      context: op.resolvedContext,
      selectedTests: op.selectedTests,
      purpose,
      status: 'running',
    };
    this.record.operationInvocations ??= [];
    (this.record.operationInvocations as Invocation[]).push(invocation);
    observe(this.root, this.record, 'operation.invocation', invocation);
    save(this.root, this.record);
    return invocation;
  }

  /** Preserves command output and cancellation separately from semantic command failure. */
  private failed(invocation: Invocation, error: unknown): void {
    invocation.status = this.signal.aborted ? 'cancelled' : 'failed';
    invocation.error = String(error);
    if (error && typeof error === 'object' && 'commandResult' in error)
      invocation.result = error.commandResult as CommandResult;
    else invocation.status = this.signal.aborted ? 'cancelled' : 'interrupted';
  }

  /** Publishes completion after the supervisor has stopped the command and descendants. */
  private finish(invocation: Invocation, op: Operation): void {
    const artifacts = new OperationArtifacts(this.root, this.record);
    for (const path of op.artifacts) {
      try {
        invocation.artifacts.push(artifacts.capture(path, invocation.id));
      } catch (error) {
        invocation.artifactErrors.push(String(error));
      }
    }
    const missing = invocation.artifactErrors.length > 0;
    if (missing && invocation.status === 'completed') invocation.status = 'failed';
    observe(this.root, this.record, 'operation.invocation-finished', invocation);
    save(this.root, this.record);
    if (missing && invocation.result?.exitCode === 0)
      throw new Error(
        'Operation artifact evidence incomplete: ' + invocation.artifactErrors.join('; '),
      );
  }
}
