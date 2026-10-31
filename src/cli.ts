#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { captureChanges } from './changes.js';
import { InputError } from './config.js';
import { saveMarkdown } from './report.js';
import { stateRoot, lock, save, type RecordData } from './state.js';
import { runSteward } from './steward.js';
import { createWorkspace, prepareWorkspace, cleanup } from './workspace.js';

const help = `ArcNexus
  run <component-id> <objective> --project <repository> [--model <model>] [--codex-path <executable>]
  prepare --project <repository>
  cleanup <workspace-id>
Shared run/prepare options: --base <ref> --issue <number> --timeout-seconds <seconds>
`;
function argumentsForCommand() {
  try {
    return parseArgs({ allowPositionals: true, options: {
      project: { type: 'string' }, model: { type: 'string' }, 'codex-path': { type: 'string' },
      base: { type: 'string' }, issue: { type: 'string' }, 'timeout-seconds': { type: 'string' },
      help: { type: 'boolean' }, version: { type: 'boolean' },
    } });
  } catch (error) { throw new InputError(String(error)); }
}
function finalize(root: string, record: RecordData): void {
  record.finishedAt = new Date().toISOString();
  record.elapsedMs = Date.now() - Date.parse(record.startedAt);
  try { captureChanges(root, record); }
  catch (error) {
    record.evidenceError = String(error);
    if (process.exitCode === undefined) { process.exitCode = 1; record.status = 'failed'; }
  }
  save(root, record);
  saveMarkdown(root, record);
  console.log(JSON.stringify(record));
}
async function main(): Promise<void> {
  let record: RecordData | undefined, root: string | undefined, unlock: (() => void) | undefined;
  let timer: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  let cancelled = false;
  const cancel = () => { cancelled = true; controller.abort(new Error('Cancelled')); };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try {
    const { values, positionals } = argumentsForCommand();
    if (values.help) { console.log(help); return; }
    if (values.version) { console.log('0.1.0'); return; }
    const command = positionals[0];
    if (!['prepare', 'cleanup', 'run'].includes(command ?? '')) throw new InputError(help);
    if (command === 'prepare' && (!values.project || positionals.length !== 1)) throw new InputError('prepare requires --project');
    if (command === 'run' && (!values.project || positionals.length !== 3 || !positionals[2]?.trim())) throw new InputError('run requires component, objective and --project');
    if (command === 'cleanup' && positionals.length !== 2) throw new InputError('cleanup requires workspace ID');
    if (values.issue && !/^[1-9]\d*$/.test(values.issue)) throw new InputError('Invalid issue number');
    const seconds = Number(values['timeout-seconds'] ?? 900);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2_147_483) throw new InputError('Invalid timeout');
    root = stateRoot(); unlock = lock(root);
    timer = setTimeout(() => controller.abort(new Error('Operation timed out')), seconds * 1000);
    if (command === 'cleanup') console.log(JSON.stringify(cleanup(root, positionals[1]!)));
    else {
      record = createWorkspace(root, { project: values.project!, base: values.base, issue: values.issue });
      if (command === 'run') await runSteward(root, record, positionals[1]!, positionals[2]!, values.model ?? 'gpt-6-luna', values['codex-path'] ?? 'codex', controller.signal);
      else await prepareWorkspace(root, record, controller.signal);
    }
  } catch (error) {
    if (record) {
      record.status = cancelled ? 'cancelled' : ['blocked', 'no_changes'].includes(record.status) ? record.status : 'failed';
      record.error = String(error);
    }
    process.exitCode = cancelled ? 130 : error instanceof InputError ? 2 : 1;
    console.error(String(error));
  } finally {
    if (timer) clearTimeout(timer);
    try { if (record && root) finalize(root, record); }
    finally { unlock?.(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
  }
}
await main();
