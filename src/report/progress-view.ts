import type { Plan } from '../assignment/plan.js';
import type { RecordData } from '../workspace/state.js';
export function progressView(
  record: RecordData,
  events: Array<{ type: string; payload: any }> = [],
) {
  const plan = record.plan as Plan | undefined;
  const progress = record.progress as { lastVerified?: unknown; warnings?: unknown[] } | undefined;
  const profile = (
    record.resolvedAssignment as { executionProfile?: Record<string, unknown> } | undefined
  )?.executionProfile;
  return {
    stage: record.stage ?? 'unavailable',
    currentCommand: observedCommand(events) ?? record.currentOperation ?? null,
    lastVerified: progress?.lastVerified ?? null,
    loopWarnings: progress?.warnings ?? [],
    cancellation:
      record.status === 'cancelled' ? 'cancelled' : (record.cancellation ?? 'not requested'),
    checklist: checklistProgress(plan),
    hostChecks: plan?.hostChecks ?? null,
    limits: executionLimits(
      (record.executionLimits as Record<string, unknown> | undefined) ?? profile,
    ),
  };
}
function checklistProgress(plan?: Plan) {
  return {
    revision: plan?.version ?? null,
    total: plan?.items.length ?? null,
    completed: plan?.items.filter((i) => i.status === 'completed').length ?? null,
    remaining:
      plan?.items.filter((i) => !['completed', 'skipped'].includes(i.status)).map((i) => i.id) ??
      [],
    indicator: plan?.items.length ? 'checklist' : 'indeterminate',
    basis: 'agent claims; host checks reported separately',
  };
}
function executionLimits(profile?: Record<string, unknown>) {
  return Object.fromEntries(
    [
      'timeoutSeconds',
      'commandTimeoutSeconds',
      'maxTurns',
      'maxCorrectiveTurns',
      'maxAttempts',
      'maxOperationCalls',
      'maxChecklistCalls',
    ].map((key) => [key, profile?.[key] ?? 'not configured']),
  );
}
function text(value: unknown): string {
  return JSON.stringify(value ?? 'unavailable', (_key, item) => item ?? 'unavailable').replace(
    /[<>&`]/g,
    (c) => `&#${c.charCodeAt(0)};`,
  );
}
export function progressMarkdown(record: RecordData): string {
  const view = progressView(record);
  return `## Initialization\n\n${text(record.initialization)}\n\n## Execution progress\n\nStage: ${text(view.stage)}; Current command: ${text(view.currentCommand)}\n\nChecklist: ${text(view.checklist)}\n\nLast verified progress: ${text(view.lastVerified)}\n\nLoop warnings: ${text(view.loopWarnings)}\n\nCancellation: ${text(view.cancellation)}\n\nConfigured execution limits: ${text(view.limits)}\n\nElapsed time is observation, not an ETA. Checklist completion remains an agent claim; mandatory host checks determine success.\n\n`;
}

function observedCommand(events: Array<{ type: string; payload: any }>): unknown {
  let command: unknown = null;
  for (const event of events) {
    const { type, payload } =
      event.type === 'initialization.event' && event.payload?.type ? event.payload : event;
    if (['setup.started', 'initializer.check.started'].includes(type)) command = payload.command;
    if (['initializer.check.completed', 'initialization.finished'].includes(type)) command = null;
    if (type === 'setup.result' || type === 'operation.completed' || type === 'operation.failed')
      command = null;
    if (type === 'activity.started' && payload.detail?.command) command = payload.detail;
    if (type === 'activity.completed' || type === 'activity.failed') command = null;
    if (type === 'operation.started') command = payload.id;
    if (type === 'codex.event' && payload.item?.type === 'command_execution')
      command = payload.type === 'item.completed' ? null : payload.item.command;
  }
  return command;
}
