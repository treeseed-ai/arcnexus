import { initializeExecution, type InitializationEvidence } from '../task-intake/initializer.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { prepareCapabilities } from '../operations/probes.js';
import type { AgentResult } from '../steward/codex.js';
import type { RecordData } from '../workspace/state.js';
import { assertIdentity, assertOutputs, prepareWorkspace } from '../workspace/workspace.js';
import { SessionState } from './session-state.js';
import { SessionTurn } from './session-turn.js';
import { SessionVerification } from './session-verification.js';
import { SessionWorkflow } from './session-workflow.js';

export interface StewardCheckpoint {
  schemaVersion: 1;
  authorityHash: string;
  threadId: unknown;
  activity: unknown;
  status: string;
  plan: unknown;
  frozenTests: unknown;
  regression: unknown;
  implementationAttempts: unknown;
  operationCalls: unknown;
  planUpdateCalls: unknown;
  activeMs: number;
  candidateDigest: string;
  turns: unknown;
  usage: unknown;
}

export interface SessionControl {
  initialized?: boolean;
  prepared: boolean;
  context: string;
  inspect: () => void;
  elapsedMs: () => number;
  actions: (activity: string) => string[];
  chargeTurn: (kind: 'engineering' | 'coordination') => void;
  onResult: (
    session: StewardSession,
    activity: string,
    result: AgentResult,
  ) => Promise<{ again: boolean; feedback: string }>;
}

/** Retains one Codex thread across planned, corrective and handoff continuations. */
export class StewardSession {
  private state?: SessionState;

  private turns?: SessionTurn;

  private verification?: SessionVerification;

  /** Retains captured execution inputs and optional handoff control without starting inference. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly id: string,
    private readonly objective: string,
    private readonly model: string,
    private readonly executable: string,
    private readonly signal: AbortSignal,
    private readonly maxAttempts?: number,
    private readonly control?: SessionControl,
    private readonly initialization?: InitializationEvidence,
  ) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    await this.initializeSession();
    await new SessionWorkflow(this.state!, this.turns!, this.verification!).run();
  }

  /** Advances one durable stage, preserving continuation when an owner request yields. */
  async step(): Promise<void> {
    this.record.generalExecution = true;
    await this.initializeSession();
    await new SessionWorkflow(this.state!, this.turns!, this.verification!).step();
  }

  /** Reconstructs stage services and establishes prerequisites only on the initial activation. */
  private async initializeSession(): Promise<void> {
    const { root, record, id, objective, model, executable, signal, maxAttempts, control } = this;
    const retained = Boolean(record.continuation);
    this.state = new SessionState({
      root,
      record,
      id,
      objective,
      model,
      executable,
      signal,
      maxAttempts,
      control,
      session: this,
    });
    if (!retained) await this.prepare();
    if (this.initialization) this.acceptInitialization();
    if (!retained && !control?.initialized && !this.initialization)
      await initializeExecution({
        root,
        record,
        resolved: this.state.resolved,
        owners: [id],
        executable,
        signal,
      });
    this.verification = new SessionVerification(this.state);
    this.turns = new SessionTurn(this.state, this.verification);
  }

  /** Requires a valid ready result before allowing participant inference. */
  private acceptInitialization(): void {
    if (
      this.initialization!.authorityHash !== this.state!.resolved.digest ||
      this.initialization!.result?.status !== 'ready'
    )
      throw new Error('Accepted initialization does not match assignment authority');
    this.record.initialization = this.initialization;
  }

  /** Runs a read-only coordination turn on the retained assignment thread. */
  async controlTurn(instructions: string): Promise<AgentResult> {
    if (!this.turns) throw new Error('Session not active');
    return this.turns.run('coordination', instructions, true, 'coordination');
  }

  /** Checks the final candidate rather than relying on a steward’s completion claim. */
  async verifyFinal(): Promise<void> {
    if (!this.verification) throw new Error('Session not initialized');
    await this.verification.final();
  }

  /** Persists continuation state before control can pass to another owner. */
  captureCheckpoint(): void {
    if (!this.state) throw new Error('Session not initialized');
    this.state.checkpoint();
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  private async prepare(): Promise<void> {
    if (!this.control?.prepared) await prepareWorkspace(this.root, this.record, this.signal);
    if (existsSync(join(this.record.workspace, '.codex/config.toml')))
      throw new Error('Setup introduced Codex configuration');
    if (!this.control?.prepared) {
      await prepareCapabilities(this.root, this.record, this.signal);
      for (const c of this.state!.component.verification) await this.state!.command(c, 'baseline');
      assertIdentity(this.record);
      assertOutputs(this.record.workspace, this.record.environment);
    }
  }
}

export async function runSteward(
  root: string,
  record: RecordData,
  id: string,
  objective: string,
  model: string,
  executable: string,
  signal: AbortSignal,
  maxAttempts?: number,
  initialization?: InitializationEvidence,
): Promise<void> {
  await new StewardSession(
    root,
    record,
    id,
    objective,
    model,
    executable,
    signal,
    maxAttempts,
    undefined,
    initialization,
  ).run();
}
