import { randomUUID } from 'node:crypto';
import { InputError } from '../architecture/config.js';
import { git } from '../operations/process.js';
import { digest, resolveBase } from '../architecture/assignment.js';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync, mkdirSync, openSync, closeSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunnerSnapshot } from './runner-snapshot.js';
import { setTimeout as delay } from 'node:timers/promises';
import { ExecutionContext, type ProjectExecution } from '../architecture/execution-context.js';
import { stateRoot } from '../workspace/state.js';

export interface HostRequest {
  action: string;
  prompt?: string;
  id?: string;
  answer?: string;
}

/** Connects CLI invocations to the one private host for a canonical repository. */
export class HostClient {
  private capturedContext?: ProjectExecution;

  private readonly key: string;

  readonly root = stateRoot();

  readonly directory: string;

  readonly socket: string;

  /** Resolves project identity without changing source or starting model execution. */
  constructor(private readonly cwd: string) {
    const { source } = resolveBase(cwd);
    const common = realpathSync(
      git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    );
    this.key = digest(common).slice(0, 24);
    this.directory = join(this.root, 'projects', this.key);
    const sockets = join(tmpdir(), `arcnexus-${process.getuid?.() ?? 'user'}`);
    mkdirSync(sockets, { recursive: true, mode: 0o700 });
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.socket = join(sockets, this.key + '.sock');
  }

  /** Captures executable configuration only when creating or validating new work. */
  get context(): ProjectExecution {
    return (this.capturedContext ??= new ExecutionContext().resolve(this.cwd));
  }

  /** Starts a host when necessary and waits for its local readiness, not an execution deadline. */
  async ensure(action = 'status'): Promise<void> {
    if (await this.alive()) {
      if (await this.compatible(action)) return;
    }
    this.launch();
    await this.waitForHost();
    await this.compatible(action);
  }

  /** Refuses authority drift during retained work and replaces an inactive host automatically. */
  private async compatible(action: string): Promise<boolean> {
    if (['status', 'stop', 'pause'].includes(action)) return true;
    const context = (await this.request({ action: 'identity' })) as ProjectExecution;
    const identity = (c: ProjectExecution) =>
      digest(JSON.stringify([c.base, c.packageId, c.bindings]));
    if (identity(context) === identity(this.context)) return true;
    const status = await this.request({ action: 'status' });
    if (
      (status.workday && status.workday.status !== 'stopped') ||
      status.tasks.some((r: { status: string }) => ['running', 'pausing'].includes(r.status))
    )
      throw new Error(
        'Captured source/package/bindings changed; stop the workday before starting with updated authority',
      );
    await this.request({ action: 'retire' });
    for (let observation = 0; observation < 100; observation++) {
      if (!(await this.alive())) return false;
      await delay(50);
    }
    throw new Error('Old host did not release execution ownership');
  }

  /** Starts the detached host with private context and logs, leaving execution to its scheduler. */
  private launch(): void {
    const context = join(this.directory, 'context-' + randomUUID() + '.json');
    writeFileSync(context, JSON.stringify(this.context), { mode: 0o600 });
    const runner = new RunnerSnapshot().capture(this.root);
    const log = openSync(join(this.directory, 'host.log'), 'a', 0o600);
    const child = spawn(
      process.execPath,
      [
        join(runner.directory, 'dist/library/execution-runtime/host-main.js'),
        this.root,
        context,
        this.socket,
      ],
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
      socket.setTimeout(5000, () => socket.destroy(new Error('Host control transport timed out')));
      socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
      socket.on('error', reject);
      socket.on('data', (chunk) => {
        data += String(chunk);
        if (!data.includes('\n')) return;
        socket.end();
        try {
          const response = JSON.parse(data.split('\n')[0]!);
          if (response.error)
            reject(response.invalid ? new InputError(response.error) : new Error(response.error));
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
    if (!existsSync(this.socket)) return false;
    try {
      const identity = (await this.request({ action: 'identity' })) as ProjectExecution;
      return identity.key === this.key;
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
