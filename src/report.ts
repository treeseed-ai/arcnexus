import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordData } from './state.js';
export function markdownReport(record: RecordData): string {
  return `# ArcNexus execution ${record.id}\n\nStatus: ${record.status}\n\nObjective: ${String(record.objective??'Prepare environment')}\n\nWorkspace: ${record.workspace}\n\nBase: ${record.base}\n\n${record.error?`Failure: ${record.error}\n\n`:''}Commands recorded: ${record.commands.length}\n\nSee report.json, events.jsonl, changes.patch and command logs for evidence.\n`;
}
export function saveMarkdown(root: string, record: RecordData): void {
  writeFileSync(join(root,'runs',record.id,'report.md'),markdownReport(record),{mode:0o600});
}
