import type { RecordData } from "../workspace/state.js";
const text = (value: unknown) =>
  String(value ?? "unavailable")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
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
export function workdayMetrics(report: WorkdayReport) {
  const turns = report.assignments.flatMap((a) =>
      Array.isArray(a.turns) ? (a.turns as Array<Record<string, unknown>>) : [],
    ),
    sum = (items: Array<Record<string, unknown>>, key: string) =>
      items.reduce(
        (n, v) => n + (typeof v[key] === "number" ? (v[key] as number) : 0),
        0,
      );
  const coordination = turns.filter(
      (t) =>
        t.activity === "coordination" ||
        ["clarify", "reject"].includes(String(t.coordinationAction)),
    ),
    continuations = turns.filter(
      (t) => t.category === "continuation" && !coordination.includes(t),
    );
  const coordinationMs = sum(coordination, "durationMs") + report.routingMs,
    continuationMs = sum(continuations, "durationMs");
  const usage: Record<string, number> = {};
  for (const a of report.assignments)
    if (a.usage && typeof a.usage === "object")
      for (const [key, value] of Object.entries(a.usage))
        if (typeof value === "number") usage[key] = (usage[key] ?? 0) + value;
  return {
    engineeringMs: sum(
      turns.filter(
        (t) => !coordination.includes(t) && !continuations.includes(t),
      ),
      "durationMs",
    ),
    coordinationMs,
    continuationMs,
    verificationMs: report.assignments.reduce(
      (n, a) => n + a.commands.reduce((m, c) => m + c.durationMs, 0),
      0,
    ),
    dependencyWaitingMs: sum(report.assignments, "dependencyWaitingMs"),
    coordinationOverhead: report.elapsedMs
      ? coordinationMs / report.elapsedMs
      : 0,
    usage: Object.keys(usage).length ? usage : null,
    usageComplete: report.assignments.every((a) => a.usageComplete === true),
    basis:
      "Host-observed explicit coordination turns and routing time; continuation time shown separately. Each thread cumulative usage counted once.",
  };
}
export function workdayMarkdown(report: WorkdayReport): string {
  const metrics = workdayMetrics(report),
    requests = report.messages.filter((m) => m.kind === "request"),
    unrouted = report.assignments
      .flatMap((a) =>
        Array.isArray(a.requests)
          ? (a.requests as Array<Record<string, unknown>>)
          : [],
      )
      .filter(
        (r) =>
          !requests.some((m) => {
            const p = m.payload as Record<string, unknown>;
            return (
              p.fromComponent === r.fromComponent &&
              p.ownerId === r.ownerId &&
              p.request === r.request
            );
          }),
      ),
    outstanding = requests.filter(
      (r) =>
        !report.messages.some(
          (m) =>
            m.replyTo === r.id &&
            (m.payload as { decision?: string })?.decision === "delivered",
        ),
    );
  return (
    `# Workday ${text(report.workspaceId)}\n\nEvidence mode: ${text(report.evidenceMode)}\nStatus: ${text(report.status)}\nWorkspace: ${text(report.workspace)}\nBase: ${text(report.base)}\nFailure: ${text(report.error ?? "none recorded")}\n\n## Owners and execution\n\n` +
    "| Owner | Outcome | Thread | Turns | Attempts | Active ms |\n| --- | --- | --- | ---: | ---: | ---: |\n" +
    report.assignments
      .map(
        (a) =>
          `| ${text((a.resolvedAssignment as { componentId: string }).componentId)} | ${text(a.outcome ?? a.status)} | ${text(a.threadId)} | ${Array.isArray(a.turns) ? a.turns.length : "unavailable"} | ${text(a.implementationAttempts)} | ${text(a.activeMs)} |`,
      )
      .join("\n") +
    `\n\n## Timing and usage\n\nElapsed: ${report.elapsedMs} ms. Coordination allowance used: ${report.coordinationTurns}/6. Clarification rounds: ${report.clarificationRounds}/2.\n\n${text(JSON.stringify(metrics))}\n\nSupplied prompt sizes are not the complete effective Codex context. Agent findings and checklist completion remain claims; host checks below supply verification.\n\n## Inbox and delivery\n\n` +
    report.messages
      .map(
        (m) =>
          `- ${text(m.id)}: ${text(m.from)} → ${text(m.to)}; ${text(m.kind)}; reply to ${text(m.replyTo)}; ${text(JSON.stringify(m.payload))}`,
      )
      .join("\n") +
    `\n\n## Outstanding needs\n\n${outstanding.length || unrouted.length ? [...outstanding.map((m) => "- " + text(JSON.stringify(m.payload))), ...unrouted.map((r) => "- Unrouted agent claim (not host-authorized): " + text(JSON.stringify(r)))].join("\n") : "No undelivered request recorded."}\n\n## Host checks\n\n` +
    report.assignments
      .flatMap((a) =>
        a.commands.map(
          (c) =>
            `- ${text((a.resolvedAssignment as { componentId: string }).componentId)} / ${text(c.stage)}: ${text(c.command + " " + c.args.join(" "))}; exit ${text(c.exitCode)}; ${c.durationMs} ms; ${text(c.log)}`,
        ),
      )
      .join("\n") +
    "\n\n## Owned changes and resources\n\n" +
    report.assignments
      .map(
        (a) =>
          `- ${text((a.resolvedAssignment as { componentId: string }).componentId)}: changes ${text(JSON.stringify(a.ownedChanges ?? "unavailable"))}; services ${text(JSON.stringify(a.services ?? []))}; caller interventions ${text(JSON.stringify(a.callerInterventions ?? []))}; context and plan: ${text(a.id)} assignment report.`,
      )
      .join("\n") +
    `\n\nParking: ${text(report.parking.status)}; evidence ${text(report.parking.path)}.\n\nIntegration remains caller-owned. See report.json, SQLite events, and per-assignment reports for raw usage, prompts, checkpoints and frozen-test evidence.\n`
  );
}
