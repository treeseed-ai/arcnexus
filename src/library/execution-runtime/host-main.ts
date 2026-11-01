import { InputError } from '../architecture/config.js';
import { ExecutionLease } from '../coordination-store/execution-store.js';
import { createServer, type Socket } from 'node:net';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectExecution } from '../architecture/execution-context.js';
import { processStart } from '../operations/service-state.js';
import { ProjectHost } from './project-host.js';
import type { HostRequest } from './host-client.js';

/** Owns the private IPC listener and keeps lifecycle controls responsive during inference. */
class HostServer {
  private readonly host: ProjectHost;

  private readonly lease: ExecutionLease;

  private readonly server = createServer((socket) => this.connection(socket));

  /** Opens the sole project writer using the captured startup context. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
    private readonly socket: string,
  ) {
    this.lease = new ExecutionLease(socket + '.lease.sqlite');
    this.host = new ProjectHost(root, context);
  }

  /** Publishes readiness after binding IPC and starts sequential scheduling. */
  start(): void {
    rmSync(this.socket, { force: true });
    this.server.listen(this.socket, () => {
      chmodSync(this.socket, 0o600);
      writeFileSync(
        join(this.root, 'projects', this.context.key, 'host.json'),
        JSON.stringify({ pid: process.pid, start: processStart(process.pid) }),
        { mode: 0o600 },
      );
    });
    setInterval(() => {
      void this.host.tick().catch((error) => console.error(error));
    }, 100);
  }

  /** Parses one bounded control message; malformed input cannot mutate execution state. */
  private connection(socket: Socket): void {
    let data = '';
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      data += String(chunk);
      if (Buffer.byteLength(data) > 1024 * 1024) {
        socket.destroy();
        return;
      }
      if (!data.includes('\n')) return;
      try {
        const value = this.dispatch(JSON.parse(data.split('\n')[0]!));
        socket.end(JSON.stringify({ value }) + '\n');
      } catch (error) {
        socket.end(
          JSON.stringify({ error: String(error), invalid: error instanceof InputError }) + '\n',
        );
      }
    });
  }

  /** Allows automatic authority replacement only after all executable runs have ended. */
  private retire(): boolean {
    const status = this.host.status();
    if (
      status.active ||
      (status.workday && status.workday.status !== 'stopped') ||
      status.tasks.some((r) => ['running', 'pausing'].includes(r.status))
    )
      throw new Error('Active execution host cannot retire');
    setTimeout(() => {
      this.lease.close();
      process.exit(0);
    }, 50);
    return true;
  }

  /** Routes explicit controls while keeping scheduling policy inside the host. */
  private dispatch(request: HostRequest): unknown {
    if (request.action === 'identity') return this.context;
    if (request.action === 'retire') return this.retire();
    if (request.action === 'submit') return this.host.submit(String(request.prompt ?? ''));
    if (request.action === 'task-status') return this.host.reports.view(String(request.id));
    if (request.action === 'answer') {
      this.host.answer(String(request.id), String(request.answer));
      return true;
    }
    if (request.action === 'cancel') {
      this.host.cancel(String(request.id));
      return true;
    }
    return this.host.control(request.action);
  }
}

const [root, context, socket] = process.argv.slice(2);

if (!root || !context || !socket)
  throw new Error('Private execution host requires captured startup paths');

new HostServer(root, JSON.parse(readFileSync(context, 'utf8')), socket).start();
