import type { Command } from '../architecture/config.js';
import { executeDirect, type CommandResult } from './process.js';

interface Start {
  command: Command;
  cwd: string;
  log: string;
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number };
}

/** Stops managed subprocess groups when their controlling parent disappears. */
class CommandSupervisor {
  private readonly controller = new AbortController();

  private started = false;

  /** Registers command completion and parent-liveness handlers. */
  listen(): void {
    process.on('disconnect', () => this.controller.abort(new Error('Command parent disconnected')));
    process.on('SIGTERM', () => this.controller.abort(new Error('Command supervisor terminated')));
    process.on('message', (message: Start | { cancel: string }) => this.receive(message));
  }

  /** Processes the parent control message without accepting arbitrary new commands. */
  private receive(message: Start | { cancel: string }): void {
    if ('cancel' in message) {
      this.controller.abort(new Error(message.cancel));
      return;
    }
    if (this.started) return;
    this.started = true;
    void this.execute(message);
  }

  /** Runs the requested action through the configured execution boundary. */
  private async execute(message: Start): Promise<void> {
    let response: { result?: CommandResult; error?: string };
    try {
      response = {
        result: await executeDirect(
          message.command,
          message.cwd,
          message.log,
          this.controller.signal,
          message.options,
        ),
      };
    } catch (error) {
      response = {
        error: error instanceof Error ? error.message : String(error),
        ...(error && typeof error === 'object' && 'commandResult' in error
          ? { result: error.commandResult as CommandResult }
          : {}),
      };
    }
    if (process.connected) process.send?.(response, () => process.disconnect());
  }
}

new CommandSupervisor().listen();
