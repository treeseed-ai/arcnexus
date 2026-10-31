import {
  appendFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  digest,
  materializeChecks,
  materializeEvidence,
  type ResolvedAssignment,
} from '../architecture/assignment.js';
import { targetCommand } from '../architecture/bindings.js';
import { covered } from '../architecture/components.js';
import { InputError, type Command } from '../architecture/config.js';
import { changes, checkScope } from '../change-inspection/changes.js';
import { operationEnvironment } from '../operations/operations.js';
import { execute, git, type CommandResult } from '../operations/process.js';
import { observe } from '../report/timeline.js';
import { type AgentResult } from '../steward/codex.js';
import { save, type RecordData } from '../workspace/state.js';
import { assertGeneratedOutputs, assertIdentity } from '../workspace/workspace.js';
import { candidateDigest, type FrozenTest } from './checkpoints.js';
import type { SessionControl, StewardCheckpoint, StewardSession } from './steward.js';
export interface SessionOptions {
  root: string;
  record: RecordData;
  id: string;
  objective: string;
  model: string;
  executable: string;
  signal: AbortSignal;
  maxAttempts: number;
  control?: SessionControl;
  session: StewardSession;
}
export class SessionState {
  readonly resolved: ResolvedAssignment;
  readonly component;
  readonly assignment;
  readonly documentationOnly;
  readonly scope: string[];
  readonly dir: string;
  readonly hostChecks;
  readonly turns: Array<Record<string, unknown>> = [];
  readonly planned: boolean;
  readonly activities: Array<Record<string, unknown>> = [];
  resumeId?: string;
  frozen: FrozenTest[] = [];
  regression: AgentResult['regression'] = null;
  specificationFinished = false;
  constructor(readonly options: SessionOptions) {
    const { root, record, maxAttempts } = options;
    const resolved = record.resolvedAssignment as ResolvedAssignment | undefined;
    if (!resolved) throw new InputError('A captured assignment is required');
    if (maxAttempts !== 1 && maxAttempts !== 2) throw new InputError('Invalid maximum attempts');
    this.resolved = resolved;
    this.component = resolved.context.at(-1)!;
    this.assignment = resolved.assignment;
    this.documentationOnly = this.assignment.changeType === 'documentation';
    this.scope = this.assignmentScope();
    this.validate();
    this.dir = join(root, 'runs', record.id);
    this.hostChecks = materializeChecks(resolved, join(this.dir, 'acceptance'));
    this.planned = resolved.executionProfile.schemaVersion === 2;
    this.initialize();
  }
  private assignmentScope(): string[] {
    const { assignment, documentationOnly, resolved, component } = this;
    return assignment.kind === 'change'
      ? documentationOnly
        ? [...new Set([...resolved.allowedWritePaths, ...component.documentation])].filter(
            (p) => covered(p, component.documentation) && covered(p, resolved.allowedWritePaths),
          )
        : resolved.allowedWritePaths
      : [];
  }
  private validate(): void {
    const { assignment, component, documentationOnly } = this;
    const { record } = this.options;
    if (
      assignment.kind === 'change' &&
      (!component.documentation.length || (!documentationOnly && !component.tests.length))
    )
      throw new InputError(
        'Change workflow requires declared documentation and regression test scope',
      );
    if (
      git(record.source, 'ls-tree', '-r', '--name-only', record.base)
        .split('\n')
        .some((p) => p === '.codex/config.toml' || p.endsWith('/.codex/config.toml'))
    )
      throw new InputError('Target Codex configuration is unsupported');
  }
  private initialize(): void {
    const { record, root, objective } = this.options;
    materializeEvidence(this.resolved, join(this.dir, 'prior-evidence'));
    observe(root, record, 'context.history', {
      items: this.resolved.priorEvidence.map(({ content, ...item }) => item),
    });
    Object.assign(record, {
      turns: this.turns,
      attempts: [],
      context: this.resolved.context,
      objective,
      verification: this.component.verification,
      usage: null,
      usageComplete: true,
      implementationAttempts: 0,
      callerInterventions: [],
      requests: [],
      activities: this.activities,
    });
  }
  journal(activity: string, status: string, detail: unknown) {
    const event = {
      at: new Date().toISOString(),
      turn: this.turns.length,
      activity,
      status,
      detail,
    };
    this.activities.push(event);
    observe(this.options.root, this.options.record, 'activity.' + status, event);
    appendFileSync(join(this.dir, 'activities.jsonl'), JSON.stringify(event) + '\n', {
      mode: 0o600,
    });
    save(this.options.root, this.options.record);
  }
  safe() {
    assertIdentity(this.options.record);
    if (this.options.control) {
      this.options.control.inspect();
      checkScope(
        this.options.record.workspace,
        changes(this.options.record).filter((c) =>
          covered(c.path, this.resolved.allowedWritePaths),
        ),
        this.scope,
      );
    } else checkScope(this.options.record.workspace, changes(this.options.record), this.scope);
    assertGeneratedOutputs(this.options.record.workspace, this.options.record.environment);
  }
  async command(c: Command, stage: string): Promise<CommandResult> {
    this.options.record.stage = stage;
    this.journal(stage, 'started', c);
    try {
      const result = await execute(
        targetCommand(this.options.record, c),
        this.options.record.workspace,
        join(this.dir, `command-${this.options.record.commands.length}.log`),
        this.options.signal,
        {
          timeoutMs: this.resolved.executionProfile.commandTimeoutSeconds * 1000,
          env: operationEnvironment(this.options.record),
        },
      );
      result.stage = stage;
      this.options.record.commands.push(result);
      this.journal(stage, 'completed', result);
      return result;
    } catch (error) {
      if (error && typeof error === 'object' && 'commandResult' in error)
        this.options.record.commands.push({
          ...(error.commandResult as CommandResult),
          stage,
        });
      this.journal(stage, 'failed', String(error));
      throw error;
    }
  }
  checkpoint(): void {
    persistCheckpoint(this.dir, this.options.record, this.checkpointData());
  }

  private checkpointData(): StewardCheckpoint {
    const { record, control } = this.options;
    return {
      schemaVersion: 1,
      authorityHash: this.resolved.digest,
      threadId: record.threadId ?? null,
      activity: record.stage ?? null,
      status: record.status,
      plan: record.plan ?? null,
      frozenTests: this.frozen,
      regression: this.regression,
      implementationAttempts: record.implementationAttempts ?? 0,
      operationCalls: record.operationCalls ?? 0,
      planUpdateCalls: record.planUpdateCalls ?? 0,
      activeMs: control?.elapsedMs() ?? Date.now() - Date.parse(record.startedAt),
      candidateDigest: candidateDigest(record),
      turns: record.turns,
      usage: record.usage ?? null,
    };
  }
  ownChanges() {
    return changes(this.options.record).filter((c) => covered(c.path, this.scope));
  }
}

function persistCheckpoint(dir: string, record: RecordData, value: StewardCheckpoint): void {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  const path = join(dir, 'checkpoint.json');
  writeFileSync(path + '.tmp', bytes, { mode: 0o600 });
  renameSync(path + '.tmp', path);
  const sequence = Number(record.checkpointSequence ?? 0) + 1;
  record.checkpointSequence = sequence;
  const version = join(dir, 'checkpoints', sequence + '.json');
  mkdirSync(join(dir, 'checkpoints'), { recursive: true, mode: 0o700 });
  writeFileSync(version, bytes, { mode: 0o600 });
  syncCheckpointPath(version);
  syncCheckpointPath(join(dir, 'checkpoints'));
  record.checkpoint = { path: version, sha256: digest(bytes) };
}

function syncCheckpointPath(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
