export type RunMode = 'task' | 'workday';

export type RunStatus =
  | 'running'
  | 'idle'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'interrupted'
  | 'needs_attention'
  | 'completed'
  | 'needs_input'
  | 'failed'
  | 'cancelled';

export type AssignmentStatus =
  'ready' | 'running' | 'waiting' | 'completed' | 'blocked' | 'rejected' | 'failed' | 'interrupted';

export interface ExecutionRun {
  id: string;
  mode: RunMode;
  owners: string[];
  objective: string;
  status: RunStatus;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface ExecutionAssignment {
  id: string;
  runId: string;
  owner: string;
  objective: string;
  acceptance: string[];
  status: AssignmentStatus;
  dependencies: string[];
  evidence: string[];
  data: Record<string, unknown>;
}

export interface OwnerRequest {
  existingAssignmentId?: string;
  milestone?: 'accepted' | 'delivered';
  key: string;
  owner: string;
  objective: string;
  acceptance: string[];
}

export interface InboxRequest extends OwnerRequest {
  id: string;
  from: string;
  assignmentId: string;
}

export type ActivationResult = { receipt?: string } & (
  | { kind: 'request'; requests: OwnerRequest[] }
  | {
      kind: 'inbox';
      requests: OwnerRequest[];
      actions: import('./inbox-decisions.js').InboxDecision[];
    }
  | { kind: 'completed'; evidence: string[]; candidate?: Record<string, unknown> }
  | {
      kind: 'responses';
      actions: Array<{
        requestId: string;
        action: 'accept' | 'reject' | 'clarify' | 'answer';
        text: string;
      }>;
    }
  | { kind: 'continue' }
  | { kind: 'blocked'; reason: string }
);
