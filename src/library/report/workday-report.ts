import type { RecordData } from '../workspace/state.js';

const text = (value: unknown) =>
  String(value ?? 'unavailable')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');

export interface WorkdayReport {
  status: string;
  workspaceId: string;
  workspace: string;
  base: string;
  error?: string;
  elapsedMs: number;
  coordinationTurns: number;
  clarificationRounds: number;
  parking: { status: string; path: string };
  assignments: RecordData[];
  messages: Array<{
    id: unknown;
    from: unknown;
    to: unknown;
    kind: unknown;
    replyTo: unknown;
    payload: unknown;
  }>;
  routingMs: number;
  [key: string]: unknown;
}

function recordedTurns(assignment: RecordData): Array<Record<string, unknown>> {
  return Array.isArray(assignment.turns)
    ? (assignment.turns as Array<Record<string, unknown>>)
    : [];
}

function sumDurations(items: Array<Record<string, unknown>>, key: string): number {
  return items.reduce(
    (total, value) => total + (typeof value[key] === 'number' ? (value[key] as number) : 0),
    0,
  );
}

export function workdayMetrics(report: WorkdayReport) {
  const turns = report.assignments.flatMap((assignment) => recordedTurns(assignment));
  const coordination = turns.filter(
      (t) =>
        t.activity === 'coordination' ||
        ['clarify', 'reject'].includes(String(t.coordinationAction)),
    ),
    continuations = turns.filter((t) => t.category === 'continuation' && !coordination.includes(t));
  const coordinationMs = sumDurations(coordination, 'durationMs') + report.routingMs,
    continuationMs = sumDurations(continuations, 'durationMs');
  return {
    engineeringMs: sumDurations(
      turns.filter((t) => !coordination.includes(t) && !continuations.includes(t)),
      'durationMs',
    ),
    coordinationMs,
    continuationMs,
    verificationMs: report.assignments.reduce(
      (n, a) => n + a.commands.reduce((m, c) => m + c.durationMs, 0),
      0,
    ),
    dependencyWaitingMs: sumDurations(report.assignments, 'dependencyWaitingMs'),
    coordinationOverhead: report.elapsedMs ? coordinationMs / report.elapsedMs : 0,
    usage: summedUsage(report),
    usageComplete: report.assignments.every((a) => a.usageComplete === true),
    basis:
      'Host-observed explicit coordination turns and routing time; continuation time shown separately. Each thread cumulative usage counted once.',
  };
}

function summedUsage(report: WorkdayReport): Record<string, number> | null {
  const usage: Record<string, number> = {};
  for (const a of report.assignments)
    if (a.usage && typeof a.usage === 'object')
      for (const [key, value] of Object.entries(a.usage))
        if (typeof value === 'number') usage[key] = (usage[key] ?? 0) + value;
  return Object.keys(usage).length ? usage : null;
}

export function workdayMarkdown(report: WorkdayReport): string {
  return new WorkdayMarkdown(report).render();
}

function sameRequest(payload: unknown, request: Record<string, unknown>): boolean {
  const value = payload as Record<string, unknown>;
  return (
    value.fromComponent === request.fromComponent &&
    value.ownerId === request.ownerId &&
    value.request === request.request
  );
}

function outstandingNeeds(report: WorkdayReport): string {
  const requests = report.messages.filter((m) => m.kind === 'request'),
    unrouted = report.assignments
      .flatMap((a) =>
        Array.isArray(a.requests) ? (a.requests as Array<Record<string, unknown>>) : [],
      )
      .filter((r) => !requests.some((message) => sameRequest(message.payload, r))),
    outstanding = requests.filter(
      (r) =>
        !report.messages.some(
          (m) =>
            m.replyTo === r.id && (m.payload as { decision?: string })?.decision === 'delivered',
        ),
    );
  return outstanding.length || unrouted.length
    ? [
        ...outstanding.map((m) => '- ' + text(JSON.stringify(m.payload))),
        ...unrouted.map(
          (r) => '- Unrouted agent claim (not host-authorized): ' + text(JSON.stringify(r)),
        ),
      ].join('\n')
    : 'No undelivered request recorded.';
}

/** Projects authoritative coordination evidence into a readable caller handoff. */
class WorkdayMarkdown {
  /** Retains the coordination projection used to render the caller handoff. */
  constructor(private report: WorkdayReport) {}

  /** Renders the captured workday projection without querying mutable candidate files. */
  render(): string {
    return (
      this.header() +
      this.owners() +
      this.timing() +
      this.inbox() +
      this.needs() +
      this.checks() +
      this.resources() +
      this.footer()
    );
  }

  /** Shows candidate identity and the final coordination outcome. */
  private header(): string {
    const report = this.report;
    return `# Workday ${text(report.workspaceId)}\n\nEvidence mode: ${text(report.evidenceMode)}\nStatus: ${text(report.status)}\nWorkspace: ${text(report.workspace)}\nBase: ${text(report.base)}\nFailure: ${text(report.error ?? 'none recorded')}\n\n## Owners and execution\n\n`;
  }

  /** Summarizes each owner’s assignment, checkpoint and outcome. */
  private owners(): string {
    const report = this.report;
    return (
      '| Owner | Outcome | Thread | Turns | Attempts | Active ms |\n| --- | --- | --- | ---: | ---: | ---: |\n' +
      report.assignments
        .map(
          (a) =>
            `| ${text((a.resolvedAssignment as { componentId: string }).componentId)} | ${text(a.outcome ?? a.status)} | ${text(a.threadId)} | ${Array.isArray(a.turns) ? a.turns.length : 'unavailable'} | ${text(a.implementationAttempts)} | ${text(a.activeMs)} |`,
        )
        .join('\n')
    );
  }

  /** Separates active work, verification and dependency waiting. */
  private timing(): string {
    const report = this.report;
    return `\n\n## Timing and usage\n\nElapsed: ${report.elapsedMs} ms. Coordination allowance used: ${report.coordinationTurns}; configured limit: ${text((report.budgets as { coordinationTurns?: number } | undefined)?.coordinationTurns ?? 'not configured')}. Clarification rounds: ${report.clarificationRounds}; guarded by observed progress.\n\n${text(JSON.stringify(workdayMetrics(report)))}\n\nSupplied prompt sizes are not the complete effective Codex context. Agent findings and checklist completion remain claims; host checks below supply verification.\n\n## Inbox and delivery\n\n`;
  }

  /** Shows correlated requests and responses in their recorded order. */
  private inbox(): string {
    const report = this.report;
    return report.messages
      .map(
        (m) =>
          `- ${text(m.id)}: ${text(m.from)} → ${text(m.to)}; ${text(m.kind)}; reply to ${text(m.replyTo)}; ${text(JSON.stringify(m.payload))}`,
      )
      .join('\n');
  }

  /** Makes undelivered requests and unresolved architectural needs visible. */
  private needs(): string {
    const report = this.report;
    return `\n\n## Outstanding needs\n\n${outstandingNeeds(report)}\n\n## Host checks\n\n`;
  }

  /** Summarizes the captured host verification results. */
  private checks(): string {
    const report = this.report;
    return report.assignments
      .flatMap((a) =>
        a.commands.map(
          (c) =>
            `- ${text((a.resolvedAssignment as { componentId: string }).componentId)} / ${text(c.stage)}: ${text(c.command + ' ' + c.args.join(' '))}; exit ${text(c.exitCode)}; ${c.durationMs} ms; ${text(c.log)}`,
        ),
      )
      .join('\n');
  }

  /** Shows shutdown and parking state so incomplete candidates remain explicit. */
  private resources(): string {
    const report = this.report;
    return (
      '\n\n## Owned changes and resources\n\n' +
      report.assignments
        .map(
          (a) =>
            `- ${text((a.resolvedAssignment as { componentId: string }).componentId)}: changes ${text(JSON.stringify(a.ownedChanges ?? 'unavailable'))}; services ${text(JSON.stringify(a.services ?? []))}; caller interventions ${text(JSON.stringify(a.callerInterventions ?? []))}; context and plan: ${text(a.id)} assignment report.`,
        )
        .join('\n')
    );
  }

  /** Links the readable handoff back to its detailed retained artifacts. */
  private footer(): string {
    const report = this.report;
    return `\n\nParking: ${text(report.parking.status)}; evidence ${text(report.parking.path)}.\n\nIntegration remains caller-owned. See report.json, SQLite events, and per-assignment reports for raw usage, prompts, checkpoints and frozen-test evidence.\n`;
  }
}
