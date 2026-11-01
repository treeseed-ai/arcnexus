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
import { milliseconds, InputError, type Command } from '../architecture/config.js';
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
  maxAttempts?: number;
  control?: SessionControl;
  session: StewardSession;
}

/** Holds immutable assignment authority and mutable checkpoint state for one steward. */
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

  /** Validates captured authority, materializes independent checks and initializes checkpoint state. */
  constructor(readonly options: SessionOptions) {
    const { root, record, maxAttempts } = options;
    const resolved = record.resolvedAssignment as ResolvedAssignment | undefined;
    if (!resolved) throw new InputError('A captured assignment is required');
    if (maxAttempts !== undefined && (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1))
      throw new InputError('Invalid maximum attempts');
    this.resolved = resolved;
    this.component = { ...resolved.context.at(-1)!, verification: resolved.verification };
    this.assignment = resolved.assignment;
    this.documentationOnly = this.assignment.changeType === 'documentation';
    this.scope = this.assignmentScope();
    this.validate();
    this.dir = join(root, 'runs', record.id);
    this.hostChecks = materializeChecks(resolved, join(this.dir, 'acceptance'));
    this.planned = resolved.executionProfile.schemaVersion >= 2;
    if (options.record.continuation) this.restore();
    else this.initialize();
    this.captureLimits();
  }

  /** Hydrates the retained stage without resetting plan, usage, attempts or frozen tests. */
  private restore(): void {
    const { record } = this.options;
    if (record.continuationAuthority !== this.resolved.digest)
      throw new Error('Continuation authority changed');
    this.turns.push(...((record.turns ?? []) as Array<Record<string, unknown>>));
    this.activities.push(...((record.activities ?? []) as Array<Record<string, unknown>>));
    record.turns = this.turns;
    record.activities = this.activities;
    this.resumeId = typeof record.threadId === 'string' ? record.threadId : undefined;
    this.frozen = (record.frozenTests ?? []) as FrozenTest[];
    this.regression = (record.regressionCheckpoint ?? null) as AgentResult['regression'];
    this.specificationFinished = Boolean(record.specificationFinished);
    this.safe();
  }

  /** Records only configured limits; absent values remain visibly unbounded. */
  private captureLimits(): void {
    const profile = this.resolved.executionProfile;
    const { root, record, maxAttempts } = this.options;
    record.executionLimits = {
      timeoutSeconds: profile.timeoutSeconds ?? null,
      commandTimeoutSeconds: profile.commandTimeoutSeconds ?? null,
      maxTurns: profile.maxTurns ?? null,
      maxCorrectiveTurns: profile.maxCorrectiveTurns ?? null,
      maxOperationCalls: profile.maxOperationCalls ?? null,
      maxChecklistCalls: profile.maxChecklistCalls ?? null,
      maxAttempts: maxAttempts ?? null,
    };
    observe(root, record, 'execution.limits', record.executionLimits);
    save(root, record);
  }

  /** Intersects assignment authority with the activity-specific writable roots. */
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

  /** Rejects inputs that violate the captured configuration contract. */
  private validate(): void {
    const { assignment, component, documentationOnly } = this;
    const { record } = this.options;
    if (
      assignment.kind === 'change' &&
      ((assignment.changeType !== 'refactor' && !component.documentation.length) ||
        (!documentationOnly && !component.tests.length))
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

  /** Creates the retained activity journal and captures initial session evidence. */
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

  /** Appends an activity transition to the retained execution evidence. */
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

  /** Checks candidate identity and exact scope before further execution. */
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

  /** Runs one captured host command and retains its result under the assignment. */
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
          timeoutMs: milliseconds(this.resolved.executionProfile.commandTimeoutSeconds),
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

  /** Persists thread, plan and verification state for continuation. */
  checkpoint(): void {
    persistCheckpoint(this.dir, this.options.record, this.checkpointData());
  }

  /** Builds the serializable continuation state without resetting execution counters. */
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

  /** Selects the active owner’s candidate changes for attribution and scope checks. */
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
