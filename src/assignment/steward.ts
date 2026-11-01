import { initializeExecution } from '../task-intake/initializer.js';
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
export class StewardSession {
  private state?: SessionState;
  private turns?: SessionTurn;
  private verification?: SessionVerification;
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
  ) {}
  async run(): Promise<void> {
    const { root, record, id, objective, model, executable, signal, maxAttempts, control } = this;
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
    await this.prepare();
    if (!control?.initialized)
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
    await new SessionWorkflow(this.state, this.turns, this.verification).run();
  }
  async controlTurn(instructions: string): Promise<AgentResult> {
    if (!this.turns) throw new Error('Session not active');
    return this.turns.run('coordination', instructions, true, 'coordination');
  }
  async verifyFinal(): Promise<void> {
    if (!this.verification) throw new Error('Session not initialized');
    await this.verification.final();
  }
  captureCheckpoint(): void {
    if (!this.state) throw new Error('Session not initialized');
    this.state.checkpoint();
  }
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
  ).run();
}
