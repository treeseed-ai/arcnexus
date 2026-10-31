import { fork, spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Command } from '../architecture/config.js';
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.trim());
  return result.stdout;
}
export interface CommandResult extends Command {
  stage?: string;
  cwd: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  log: string;
}
export async function executeDirect(
  command: Command,
  cwd: string,
  log: string,
  signal: AbortSignal,
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    stdout?: string;
    stderr?: string;
    killGraceMs?: number;
  } = {},
): Promise<CommandResult> {
  signal.throwIfAborted();
  const start = Date.now(),
    fd = openSync(log, 'wx', 0o600);
  const stdout = options.stdout ? openSync(options.stdout, 'wx', 0o600) : undefined;
  const stderr = options.stderr ? openSync(options.stderr, 'wx', 0o600) : undefined;
  const result: CommandResult = {
    ...command,
    cwd,
    startedAt: new Date(start).toISOString(),
    durationMs: 0,
    exitCode: null,
    log,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd,
      env: options.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let failure: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const terminate = (reason: Error) => {
      failure ??= reason;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
        killTimer ??= setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {}
        }, options.killGraceMs ?? 300);
      }
    };
    let outputBytes = 0;
    const capture = (chunk: Buffer, separate?: number) => {
      const remaining = 64 * 1024 * 1024 - outputBytes;
      if (remaining > 0) {
        writeSync(fd, chunk.subarray(0, remaining));
        if (separate !== undefined) writeSync(separate, chunk.subarray(0, remaining));
      }
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024 * 1024) terminate(new Error('Command output limit exceeded'));
    };
    child.stdout!.on('data', (chunk) => capture(chunk, stdout));
    child.stderr!.on('data', (chunk) => capture(chunk, stderr));
    const abort = () => terminate(new Error(String(signal.reason)));
    const timer = setTimeout(
      () => terminate(new Error('Command timed out')),
      options.timeoutMs ?? 120_000,
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.on('error', (error) => {
      failure = error;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      closeSync(fd);
      if (stdout !== undefined) closeSync(stdout);
      if (stderr !== undefined) closeSync(stderr);
      // Kill surviving descendants even if their group leader exited first.
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
      if (killTimer) clearTimeout(killTimer);
      result.durationMs = Date.now() - start;
      result.exitCode = code;
      if (failure || code !== 0)
        reject(
          Object.assign(failure ?? new Error(`Command failed (${code}): ${command.command}`), {
            commandResult: result,
          }),
        );
      else resolve(result);
    });
  });
}

export async function execute(
  command: Command,
  cwd: string,
  log: string,
  signal: AbortSignal,
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    stdout?: string;
    stderr?: string;
    killGraceMs?: number;
  } = {},
): Promise<CommandResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const supervisor = fork(
      fileURLToPath(new URL('./command-supervisor.js', import.meta.url)),
      [],
      { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    let response: { result?: CommandResult; error?: string } | undefined,
      failure: Error | undefined;
    const abort = () => {
      if (supervisor.connected) supervisor.send({ cancel: String(signal.reason) });
    };
    supervisor.on('error', (error) => {
      failure = error;
    });
    supervisor.on('message', (message) => {
      response = message as typeof response;
    });
    supervisor.on('close', () => {
      signal.removeEventListener('abort', abort);
      if (failure || response?.error || !response?.result)
        reject(
          Object.assign(
            failure ?? new Error(response?.error ?? 'Command supervisor exited without a result'),
            response?.result ? { commandResult: response.result } : {},
          ),
        );
      else resolve(response.result);
    });
    signal.addEventListener('abort', abort, { once: true });
    supervisor.send({ command, cwd, log, options });
    if (signal.aborted) abort();
  });
}
