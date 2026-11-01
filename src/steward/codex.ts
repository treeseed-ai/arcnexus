import type { InitializationResult } from '../architecture/initialization.js';
import type { Plan, PlanUpdate } from '../assignment/plan.js';
import type { OperationBridge } from '../operations/operations.js';
import type { RecordData } from '../workspace/state.js';
import { CodexExecution } from './codex-execution.js';
export interface CoordinationResult {
  action: 'request' | 'accept' | 'reject' | 'clarify' | 'answer';
  contract: string;
  requestId: string | null;
  text: string;
  activityComplete: boolean;
}
export interface AgentResult {
  coordination?: CoordinationResult | null;
  plan?: Plan | null;
  planUpdates?: PlanUpdate[];
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  blockers: string[];
  findings: Array<{ summary: string; evidence: string[]; uncertainty: string }>;
  activities: Array<{ activity: string; status: string; summary: string; sources: string[] }>;
  regression: { verificationIndex: number; exitCode: number; outputIncludes: string } | null;
  reviewFindings: string[];
  requests: Array<{
    fromComponent: string;
    ownerId: string | null;
    request: string;
    evidence: string[];
    acceptanceCriteria: string[];
    reason: string;
  }>;
}
export async function runCodex(
  root: string,
  record: RecordData,
  prompt: string,
  executable: string,
  model: string,
  signal: AbortSignal,
  resumeId?: string,
  operations?: OperationBridge,
): Promise<AgentResult> {
  return new CodexExecution({
    root,
    record,
    prompt,
    executable,
    model,
    signal,
    resumeId,
    operations,
  }).run();
}

export async function runInitializerCodex(
  root: string,
  record: RecordData,
  prompt: string,
  executable: string,
  model: string,
  signal: AbortSignal,
  operations?: OperationBridge,
): Promise<InitializationResult> {
  return new CodexExecution<InitializationResult>({
    root,
    record,
    prompt,
    executable,
    model,
    signal,
    responseContract: 'initializer-result',
    operations,
  }).run();
}
