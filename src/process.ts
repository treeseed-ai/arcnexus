import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import type { Command } from './config.js';
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr.trim());
  return result.stdout;
}
export interface CommandResult extends Command { cwd: string; startedAt: string; durationMs: number; exitCode: number | null; log: string }
export async function execute(command: Command, cwd: string, log: string, signal: AbortSignal): Promise<CommandResult> {
  signal.throwIfAborted();
  const start = Date.now(), fd = openSync(log, 'wx', 0o600);
  const result: CommandResult = { ...command, cwd, startedAt: new Date(start).toISOString(), durationMs: 0, exitCode: null, log };
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd, detached: true, stdio: ['ignore', fd, fd] });
    let failure: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const terminate = (reason: Error) => {
      failure ??= reason;
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        killTimer ??= setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} }, 300);
      }
    };
    const abort = () => terminate(new Error(String(signal.reason)));
    const timer = setTimeout(() => terminate(new Error('Command timed out')), 120_000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); closeSync(fd);
      // Kill surviving descendants even if their group leader exited first.
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      if (killTimer) clearTimeout(killTimer);
      result.durationMs = Date.now() - start; result.exitCode = code;
      if (failure || code !== 0) reject(Object.assign(failure ?? new Error(`Command failed (${code}): ${command.command}`), { commandResult: result }));
      else resolve(result);
    });
  });
}
