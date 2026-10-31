import { planMarkdown, type Plan } from './plan.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordData } from './state.js';
import type { Change } from './changes.js';

function filenameText(path: string): string {
  // Entities keep Markdown/HTML punctuation and line breaks inside one text item.
  return path.replace(/[^a-zA-Z0-9 /.\-]/gu, character => `&#${character.codePointAt(0)};`);
}

export function markdownReport(record: RecordData): string {
  const changes = (record.changes ?? []) as readonly Change[];
  const outcome = typeof record.outcome === 'string' && record.outcome.length > 0
    ? record.outcome
    : 'No workflow outcome recorded.';
  const activities = Array.isArray(record.activities)
    ? record.activities as Array<Record<string, unknown>>
    : [];
  const activityLines = activities.map(activity => {
    const name = typeof activity.activity === 'string' ? activity.activity : 'Unknown activity';
    const status = typeof activity.status === 'string' ? activity.status : 'Unknown status';
    return `- ${name} — ${status}`;
  }).join('\n') || 'No workflow activities recorded.';
  const changedFiles = [...changes]
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(change => `- <code>${filenameText(change.path)}</code> — ${change.kind}`)
    .join('\n') || 'No changed files observed.';
  const operations = Array.isArray(record.operations)
    ? record.operations as Array<Record<string, unknown>>
    : [];
  const operationLines = operations.map(operation => {
    const id = typeof operation.id === 'string' ? operation.id : 'Unknown operation';
    const status = operation.exitCode === 0 ? 'passed' : 'failed';
    const durationMs = typeof operation.durationMs === 'number' ? operation.durationMs : 'Unknown duration';
    const log = typeof operation.log === 'string' ? operation.log : 'Unknown log';
    return `- ${id} — ${status} — ${durationMs} ms — ${log}`;
  }).join('\n') || 'No managed operations recorded.';
  const services = Array.isArray(record.services)
    ? record.services as Array<Record<string, unknown>>
    : [];
  const serviceLines = services.map(service => {
    const id = typeof service.id === 'string' ? service.id : 'Unknown service';
    const status = typeof service.status === 'string' ? service.status : 'Unknown status';
    const endpointClosed = typeof service.endpointClosed === 'boolean' ? service.endpointClosed : 'Unknown';
    return `- ${id} — ${status} — endpointClosed: ${endpointClosed}`;
  }).join('\n') || 'No managed services recorded.';
  return `# ArcNexus execution ${record.id}\n\nStatus: ${record.status}\n\nObjective: ${String(record.objective??'Prepare environment')}\n\nWorkspace: ${record.workspace}\n\nBase: ${record.base}\n\n${record.error?`Failure: ${record.error}\n\n`:''}Commands recorded: ${record.commands.length}\n\n## Outcome\n\n${outcome}\n\n## Activities\n\n${activityLines}\n\n${record.plan?planMarkdown(record.plan as Plan)+'\n':''}## Changed files\n\n${changedFiles}\n\n## Operations\n\n${operationLines}\n\n## Managed services\n\n${serviceLines}\n\nSee report.json, events.jsonl, changes.patch and command logs for evidence.\n`;
}
export function saveMarkdown(root: string, record: RecordData): void {
  writeFileSync(join(root,'runs',record.id,'report.md'),markdownReport(record),{mode:0o600});
}
