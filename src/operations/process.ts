import { fork, spawn, spawnSync, type ChildProcess } from 'node:child_process';
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
export interface CommandOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdout?: string;
  stderr?: string;
  killGraceMs?: number;
}

export async function executeDirect(
  command: Command,
  cwd: string,
  log: string,
  signal: AbortSignal,
  options: CommandOptions = {},
): Promise<CommandResult> {
  signal.throwIfAborted();
  return new DirectCommand(command, cwd, log, signal, options).run();
}

class DirectCommand {
  private readonly start = Date.now();
  private readonly fd: number;
  private readonly stdout?: number;
  private readonly stderr?: number;
  private readonly result: CommandResult;
  private child!: ChildProcess;
  private failure?: Error;
  private killTimer?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private outputBytes = 0;
  private readonly abort = () => this.terminate(new Error(String(this.signal.reason)));

  constructor(
    private readonly command: Command,
    private readonly cwd: string,
    log: string,
    private readonly signal: AbortSignal,
    private readonly options: CommandOptions,
  ) {
    this.fd = openSync(log, 'wx', 0o600);
    this.stdout = options.stdout ? openSync(options.stdout, 'wx', 0o600) : undefined;
    this.stderr = options.stderr ? openSync(options.stderr, 'wx', 0o600) : undefined;
    this.result = {
      ...command,
      cwd,
      startedAt: new Date(this.start).toISOString(),
      durationMs: 0,
      exitCode: null,
      log,
    };
  }

  run(): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      this.child = spawn(this.command.command, this.command.args, {
        cwd: this.cwd,
        env: this.options.env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child.stdout!.on('data', (chunk) => this.capture(chunk, this.stdout));
      this.child.stderr!.on('data', (chunk) => this.capture(chunk, this.stderr));
      this.timer = setTimeout(
        () => this.terminate(new Error('Command timed out')),
        this.options.timeoutMs ?? 120_000,
      );
      this.signal.addEventListener('abort', this.abort, { once: true });
      if (this.signal.aborted) this.abort();
      this.child.on('error', (error) => {
        this.failure = error;
      });
      this.child.on('close', (code) => this.finish(code, resolve, reject));
    });
  }

  private finish(
    code: number | null,
    resolve: (result: CommandResult) => void,
    reject: (error: Error) => void,
  ): void {
    this.closed(code);
    if (!this.failure && code === 0) return resolve(this.result);
    const failure = this.failure ?? new Error(`Command failed (${code}): ${this.command.command}`);
    reject(Object.assign(failure, { commandResult: this.result }));
  }

  private terminate(reason: Error): void {
    this.failure ??= reason;
    if (!this.child.pid) return;
    this.kill('SIGTERM');
    this.killTimer ??= setTimeout(() => this.kill('SIGKILL'), this.options.killGraceMs ?? 300);
  }

  private kill(signal: NodeJS.Signals): void {
    if (!this.child.pid) return;
    try {
      process.kill(-this.child.pid, signal);
    } catch {
      /* Group may already have exited. */
    }
  }

  private capture(chunk: Buffer, separate?: number): void {
    const remaining = 64 * 1024 * 1024 - this.outputBytes;
    if (remaining > 0) {
      writeSync(this.fd, chunk.subarray(0, remaining));
      if (separate !== undefined) writeSync(separate, chunk.subarray(0, remaining));
    }
    this.outputBytes += chunk.length;
    if (this.outputBytes > 64 * 1024 * 1024)
      this.terminate(new Error('Command output limit exceeded'));
  }

  private closed(code: number | null): void {
    clearTimeout(this.timer);
    this.signal.removeEventListener('abort', this.abort);
    closeSync(this.fd);
    if (this.stdout !== undefined) closeSync(this.stdout);
    if (this.stderr !== undefined) closeSync(this.stderr);
    // Kill surviving descendants even if their group leader exited first.
    this.kill('SIGKILL');
    if (this.killTimer) clearTimeout(this.killTimer);
    this.result.durationMs = Date.now() - this.start;
    this.result.exitCode = code;
  }
}

export async function execute(
  command: Command,
  cwd: string,
  log: string,
  signal: AbortSignal,
  options: CommandOptions = {},
): Promise<CommandResult> {
  signal.throwIfAborted();
  return new SupervisedCommand(signal).run(command, cwd, log, options);
}

class SupervisedCommand {
  private response?: { result?: CommandResult; error?: string };
  private failure?: Error;
  private supervisor!: ChildProcess;
  private readonly abort = () => {
    if (this.supervisor.connected) this.supervisor.send({ cancel: String(this.signal.reason) });
  };

  constructor(private readonly signal: AbortSignal) {}

  run(command: Command, cwd: string, log: string, options: CommandOptions): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      this.supervisor = fork(
        fileURLToPath(new URL('./command-supervisor.js', import.meta.url)),
        [],
        {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
      );
      this.supervisor.on('error', (error) => {
        this.failure = error;
      });
      this.supervisor.on('message', (message) => {
        this.response = message as typeof this.response;
      });
      this.supervisor.on('close', () => {
        this.signal.removeEventListener('abort', this.abort);
        const error = this.error();
        if (error) reject(error);
        else resolve(this.response!.result!);
      });
      this.signal.addEventListener('abort', this.abort, { once: true });
      this.supervisor.send({ command, cwd, log, options });
      if (this.signal.aborted) this.abort();
    });
  }

  private error(): Error | undefined {
    if (!this.failure && !this.response?.error && this.response?.result) return;
    return Object.assign(
      this.failure ??
        new Error(this.response?.error ?? 'Command supervisor exited without a result'),
      this.response?.result ? { commandResult: this.response.result } : {},
    );
  }
}
