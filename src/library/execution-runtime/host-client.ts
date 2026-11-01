import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ExecutionContext, type ProjectExecution } from '../architecture/execution-context.js';
import { processStart } from '../operations/service-state.js';
import { stateRoot } from '../workspace/state.js';

export interface HostRequest {
  action: string;
  prompt?: string;
  id?: string;
  answer?: string;
}

/** Connects CLI invocations to the one private host for a canonical repository. */
export class HostClient {
  readonly context: ProjectExecution;

  readonly root = stateRoot();

  readonly directory: string;

  readonly socket: string;

  /** Resolves project identity without changing source or starting model execution. */
  constructor(cwd: string) {
    this.context = new ExecutionContext().resolve(cwd);
    this.directory = join(this.root, 'projects', this.context.key);
    const sockets = join(tmpdir(), `arcnexus-${process.getuid?.() ?? 'user'}`);
    mkdirSync(sockets, { recursive: true, mode: 0o700 });
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.socket = join(sockets, this.context.key + '.sock');
  }

  /** Starts a host when necessary and waits for its local readiness, not an execution deadline. */
  async ensure(): Promise<void> {
    if (await this.alive()) return;
    const lock = join(this.directory, 'launch.lock');
    let descriptor: number;
    try {
      descriptor = openSync(lock, 'wx', 0o600);
    } catch {
      return this.waitForHost();
    }
    try {
      if (await this.alive()) return;
      this.launch();
      await this.waitForHost();
    } finally {
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }

  /** Starts the detached host with private context and logs, leaving execution to its scheduler. */
  private launch(): void {
    const context = join(this.directory, 'context.json');
    writeFileSync(context, JSON.stringify(this.context), { mode: 0o600 });
    const log = openSync(join(this.directory, 'host.log'), 'a', 0o600);
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./host-main.js', import.meta.url)), this.root, context, this.socket],
      { detached: true, stdio: ['ignore', log, log] },
    );
    closeSync(log);
    child.unref();
  }

  /** Sends a single structured control request and surfaces host-side errors. */
  request(request: HostRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socket);
      let data = '';
      socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
      socket.on('error', reject);
      socket.on('data', (chunk) => {
        data += String(chunk);
        if (!data.includes('\n')) return;
        socket.end();
        try {
          const response = JSON.parse(data.split('\n')[0]!);
          if (response.error) reject(new Error(response.error));
          else resolve(response.value);
        } catch (error) {
          reject(error);
        }
      });
      socket.on('end', () => {
        if (!data.includes('\n')) reject(new Error('Host disconnected before response'));
      });
    });
  }

  /** Confirms both process identity and an answering local endpoint before trusting a stale socket. */
  private async alive(): Promise<boolean> {
    const path = join(this.directory, 'host.json');
    if (!existsSync(path)) return false;
    try {
      const host = JSON.parse(readFileSync(path, 'utf8'));
      if (processStart(host.pid) !== host.start) return false;
      await this.request({ action: 'status' });
      return true;
    } catch {
      return false;
    }
  }

  /** Bounds host startup observation only; no agent work is subject to this readiness window. */
  private async waitForHost(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await this.alive()) return;
      await delay(50);
    }
    throw new Error('Execution host did not start; inspect ' + join(this.directory, 'host.log'));
  }
}
