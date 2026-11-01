import { progressMarkdown } from './progress-view.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planMarkdown, type Plan } from '../assignment/plan.js';
import type { Change } from '../change-inspection/changes.js';
import type { RecordData } from '../workspace/state.js';

function filenameText(path: string): string {
  // Entities keep Markdown/HTML punctuation and line breaks inside one text item.
  return path.replace(/[^a-zA-Z0-9 /.-]/gu, (character) => `&#${character.codePointAt(0)};`);
}

function value(item: unknown): string {
  return item === undefined || item === null
    ? 'unavailable'
    : filenameText(typeof item === 'string' ? item : JSON.stringify(item));
}

function list(items: unknown): string {
  return !Array.isArray(items)
    ? 'unavailable'
    : items.length
      ? items.map((item) => '- ' + value(item)).join('\n')
      : 'None recorded.';
}

/** Renders captured handoff evidence while keeping missing historical fields explicit. */
class CoordinationEvidence {
  private readonly turns: Array<Record<string, unknown>> | undefined;

  private readonly resolved;

  private readonly planned: number | undefined;

  private readonly activities;

  private readonly agent;

  /** Reads available captured fields and derives planned turns without inventing missing historical data. */
  constructor(private readonly record: RecordData) {
    this.turns = Array.isArray(record.turns)
      ? (record.turns as Array<Record<string, unknown>>)
      : undefined;
    this.resolved = record.resolvedAssignment as
      | {
          assignment?: { kind?: string };
          executionProfile?: { schemaVersion?: number };
          digest?: string;
          priorEvidence?: unknown[];
        }
      | undefined;
    this.planned = this.resolved?.assignment?.kind
      ? (this.resolved.assignment.kind === 'change' ? 3 : 1) +
        ((this.resolved.executionProfile?.schemaVersion ?? 1) >= 2 ? 1 : 0)
      : undefined;
    this.activities = Array.isArray(record.activities)
      ? (record.activities as Array<{ activity?: string; detail?: { log?: string } }>)
      : [];
    this.agent = record.agent as { findings?: unknown[] } | undefined;
  }

  /** Combines accounting, verification and outstanding needs from captured evidence only. */
  render(): string {
    return (
      this.accounting() +
      this.usage() +
      this.context() +
      this.checks() +
      this.requests() +
      this.interventions() +
      this.findings()
    );
  }

  /** Shows planned and observed turns without treating missing historical counters as zero. */
  private accounting(): string {
    const { record, turns, planned } = this;
    return `## Execution accounting

Planned turns: ${value(planned)}; Actual turns: ${value(turns?.length)}; Corrective turns: ${value(turns?.filter((t) => t.activity === 'correction').length)}

Implementation attempts: ${value(record.implementationAttempts)}; Elapsed ms: ${value(record.elapsedMs)}

`;
  }

  /** Displays recorded token accounting and explicitly reports incomplete usage. */
  private usage(): string {
    const { record } = this;
    return `## Usage

Usage completeness: ${value(record.usageComplete)}; Basis: ${value(record.usageBasis)}

Captured usage: ${value(record.usage)}

`;
  }

  /** Links host-supplied prompts and provenance without claiming full model context visibility. */
  private context(): string {
    const { turns, resolved } = this;
    return `## Supplied context

Host-supplied measurements are not complete effective Codex context.
Assignment digest: ${value(resolved?.digest)}

${turns ? turns.map((t) => `- Turn ${value(t.number)}: ${value(t.promptBytes)} bytes; SHA-256 ${value(t.promptSha256)}; provenance: turns/${value(t.number)}/execution.json; prompt: turns/${value(t.number)}/prompt.txt`).join('\n') : 'unavailable'}

Selected prior evidence: ${value(
      resolved?.priorEvidence?.map((item) => {
        const { content, ...provenance } = item as Record<string, unknown>;
        return provenance;
      }),
    )}

`;
  }

  /** Separates host command results from agent claims, including expected-red failures. */
  private checks(): string {
    const { record, activities } = this;
    return `## Host checks

Captured host command results (including setup and expected-red checkpoints; a nonzero exit is not always a final failure):

${list(record.commands.map((c) => ({ stage: c.stage ?? activities.find((a) => a.detail?.log === c.log)?.activity ?? 'unavailable', command: c.command, args: c.args, exitCode: c.exitCode, durationMs: c.durationMs, log: c.log })))}

`;
  }

  /** Lists owner requests as claims rather than automatic dispatch authority. */
  private requests(): string {
    const { record } = this;
    return `## Boundary requests

Agent requests, not automatic delegation:

${list(record.requests)}

`;
  }

  /** Shows caller input required during execution, including unavailable historical data. */
  private interventions(): string {
    const { record } = this;
    return `## Caller interventions

${list(record.callerInterventions)}

`;
  }

  /** Labels conclusions and uncertainty as agent claims for independent caller review. */
  private findings(): string {
    const { agent } = this;
    return `## Findings and uncertainty

Agent claims; independent host checks are listed separately:

${list(agent?.findings)}

`;
  }
}

function activityLines(record: RecordData): string {
  const activities = Array.isArray(record.activities)
    ? (record.activities as Array<Record<string, unknown>>)
    : [];
  const activityLines =
    activities
      .map((activity) => {
        const name = typeof activity.activity === 'string' ? activity.activity : 'Unknown activity';
        const status = typeof activity.status === 'string' ? activity.status : 'Unknown status';
        return `- ${name} — ${status}`;
      })
      .join('\n') || 'No workflow activities recorded.';
  return activityLines;
}

function changedFiles(record: RecordData): string {
  const changes = (record.changes ?? []) as readonly Change[];
  const changedFiles =
    [...changes]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((change) => `- <code>${filenameText(change.path)}</code> — ${change.kind}`)
      .join('\n') || 'No changed files observed.';
  return changedFiles;
}

function operationLines(record: RecordData): string {
  const operations = Array.isArray(record.operations)
    ? (record.operations as Array<Record<string, unknown>>)
    : [];
  const operationLines =
    operations
      .map((operation) => {
        const id = typeof operation.id === 'string' ? operation.id : 'Unknown operation';
        const status = operation.exitCode === 0 ? 'passed' : 'failed';
        const durationMs =
          typeof operation.durationMs === 'number' ? operation.durationMs : 'Unknown duration';
        const log = typeof operation.log === 'string' ? operation.log : 'Unknown log';
        return `- ${id} — ${status} — ${durationMs} ms — ${log}`;
      })
      .join('\n') || 'No managed operations recorded.';
  return operationLines;
}

function serviceLines(record: RecordData): string {
  const services = Array.isArray(record.services)
    ? (record.services as Array<Record<string, unknown>>)
    : [];
  const serviceLines =
    services
      .map((service) => {
        const id = typeof service.id === 'string' ? service.id : 'Unknown service';
        const status = typeof service.status === 'string' ? service.status : 'Unknown status';
        const endpointClosed =
          typeof service.endpointClosed === 'boolean' ? service.endpointClosed : 'Unknown';
        return `- ${id} — ${status} — endpointClosed: ${endpointClosed}`;
      })
      .join('\n') || 'No managed services recorded.';
  return serviceLines;
}

export function markdownReport(record: RecordData): string {
  const outcome =
    typeof record.outcome === 'string' && record.outcome.length > 0
      ? record.outcome
      : 'No workflow outcome recorded.';
  return `# ArcNexus execution ${record.id}\n\nStatus: ${record.status}\n\nEvidence mode: ${String(record.evidenceMode ?? 'unavailable (historical)')}\n\nObjective: ${String(record.objective ?? 'Prepare environment')}\n\nWorkspace: ${record.workspace}\n\nBase: ${record.base}\n\n${record.error ? `Failure: ${record.error}\n\n` : ''}Commands recorded: ${record.commands.length}\n\n## Outcome\n\n${outcome}\n\n## Activities\n\n${activityLines(record)}\n\n${progressMarkdown(record)}${new CoordinationEvidence(record).render()}${record.plan ? planMarkdown(record.plan as Plan) + '\n' : ''}## Changed files\n\n${changedFiles(record)}\n\n## Operations\n\n${operationLines(record)}\n\n## Managed services\n\n${serviceLines(record)}\n\nSee report.json, events.jsonl, changes.patch and command logs for evidence.\n`;
}

export function saveMarkdown(root: string, record: RecordData): void {
  writeFileSync(join(root, 'runs', record.id, 'report.md'), markdownReport(record), {
    mode: 0o600,
  });
}
