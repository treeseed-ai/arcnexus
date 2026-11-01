import { OperationConfinement } from './operation-confinement.js';
import type { SourceConfinement } from './confinement.js';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { request, type ClientRequest, type IncomingMessage } from 'node:http';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { targetCommand } from '../architecture/bindings.js';
import { observe } from '../report/timeline.js';
import { save, type RecordData } from '../workspace/state.js';
import { operationEnvironment } from './environment.js';
import type { Operation } from './operations.js';
import type { CommandResult } from './process.js';
import { ownedLoopbackListener, type ServiceRecord } from './service-state.js';

export interface ServiceDefinition {
  port: number;
  readinessPath: string;
  expectedStatus: number;
  startupTimeoutSeconds?: number;
}

export interface HttpDefinition {
  serviceId: string;
  path: string;
  expectedStatus: number;
}

export function localRequest(
  port: number,
  path: string,
  signal: AbortSignal,
): Promise<{ status: number; body: string }> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || /[\r\n]/.test(path))
    throw new Error('HTTP path must be local');
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET', signal }, (res) => {
      collectResponse(req, res, resolve, reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function collectResponse(
  req: ClientRequest,
  res: IncomingMessage,
  resolve: (value: { status: number; body: string }) => void,
  reject: (error: Error) => void,
): void {
  let bytes = 0;
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 16384) {
      req.destroy(new Error('HTTP output limit exceeded'));
      return;
    }
    chunks.push(chunk);
  });
  res.on('error', reject);
  res.on('end', () => {
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      reject(new Error('HTTP redirects are not allowed'));
      return;
    }
    resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
  });
}

/** Leases one loopback HTTP service, records readiness, and verifies its shutdown. */
export class ServiceManager {
  private child?: ChildProcess;

  private confinement?: SourceConfinement;

  private current?: ServiceRecord;

  private stopped?: Promise<void>;

  /** Reuses the assignment service ledger so resource evidence survives each lease. */
  constructor(
    private root: string,
    private record: RecordData,
    private signal: AbortSignal,
  ) {
    record.services ??= [];
  }

  /** Records the latest managed service state and associated evidence. */
  private update(value: ServiceRecord) {
    this.current = value;
    const records = this.record.services as ServiceRecord[],
      index = records.findIndex((r) => r.recordPath === value.recordPath);
    if (index < 0) records.push(value);
    else records[index] = value;
    observe(this.root, this.record, 'service.' + value.status, value);
    save(this.root, this.record);
  }

  /** Starts managed work and records the state needed for its later shutdown. */
  async start(op: Operation): Promise<ServiceRecord> {
    if (op.kind !== 'service' || !op.service) throw new Error('Not a service operation');
    if (this.child) throw new Error('Only one active service lease is permitted');
    this.confinement =
      op.schemaVersion === 4
        ? await new OperationConfinement(this.root, this.record, this.signal).prepare(op)
        : undefined;
    const record = this.createRecord(op.id);
    const child = this.launch(op, record);
    const timeout = new AbortController();
    const seconds = op.service.startupTimeoutSeconds;
    const timer =
      seconds === undefined
        ? undefined
        : setTimeout(() => timeout.abort(new Error('Service readiness timed out')), seconds * 1000);
    try {
      return await this.awaitReadiness(op, child, AbortSignal.any([this.signal, timeout.signal]));
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Creates initial lifecycle evidence before managed execution begins. */
  private createRecord(id: string): ServiceRecord {
    const directory = join(this.root, 'runs', this.record.id, 'services');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lease = randomUUID();
    const record: ServiceRecord = {
      id,
      runId: this.record.id,
      status: 'starting',
      supervisorPid: 0,
      log: join(directory, lease + '.log'),
      recordPath: join(directory, lease + '.json'),
      startedAt: new Date().toISOString(),
    };
    return record;
  }

  /** Starts the declared foreground command under parent-liveness supervision. */
  private launch(op: Extract<Operation, { command: string }>, record: ServiceRecord): ChildProcess {
    const cwd = realpathSync(join(this.record.workspace, op.cwd));
    if (relative(this.record.workspace, cwd).startsWith('..'))
      throw new Error('Service working directory escapes workspace');
    const child = fork(fileURLToPath(new URL('./service-supervisor.js', import.meta.url)), [], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: operationEnvironment(this.record),
    });
    this.watch(child, record);
    const command = targetCommand(this.record, {
      command: op.command,
      args: op.args.map((a) => (a === '{workspace}' ? this.record.workspace : a)),
    });
    child.send({
      record,
      ...(this.confinement ? this.confinement.command(command, cwd) : command),
      cwd,
      env:
        this.confinement?.environment(operationEnvironment(this.record)) ??
        operationEnvironment(this.record),
      port: op.service!.port,
    });
    return child;
  }

  /** Retains the managed lease and subscribes to supervisor evidence before dispatch. */
  private watch(child: ChildProcess, record: ServiceRecord): void {
    this.child = child;
    this.current = record;
    child.on('error', () => {});
    this.stopped = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.on('message', (message: { record?: ServiceRecord }) => {
      if (message.record) this.update(message.record);
    });
    this.watchCancellation(child);
  }

  /** Propagates caller cancellation to managed work without creating a deadline. */
  private watchCancellation(child: ChildProcess): void {
    const abort = () => {
      void this.stop().catch(() => {});
    };
    this.signal.addEventListener('abort', abort, { once: true });
    child.once('close', () => this.signal.removeEventListener('abort', abort));
  }

  /** Observes readiness until success, cancellation, exit or an explicit deadline. */
  private async awaitReadiness(
    op: Extract<Operation, { command: string }>,
    child: ChildProcess,
    signal: AbortSignal,
  ): Promise<ServiceRecord> {
    const service = op.service!;
    while (true) {
      signal.throwIfAborted();
      const record = this.current!;
      if (child.exitCode !== null || record.status === 'stopped' || record.status === 'unresolved')
        throw new Error(record.error ?? 'Service supervisor exited');
      if (await this.isReady(record, service, signal)) {
        this.update({ ...record, status: 'ready' });
        return this.current!;
      }
      await delay(50, undefined, { signal });
    }
  }

  /** Reports whether is ready within this component’s captured contract. */
  private async isReady(
    record: ServiceRecord,
    service: ServiceDefinition,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!record.pid || !record.port || !ownedLoopbackListener(record.pid, record.port))
      return false;
    try {
      const response = await localRequest(record.port, service.readinessPath, signal);
      return response.status === service.expectedStatus;
    } catch (error) {
      signal.throwIfAborted();
      if (String(error).includes('redirect')) throw error;
      return false;
    }
  }

  /** Returns the retained service state without restarting it. */
  status(id: string): ServiceRecord {
    if (!this.current || this.current.id !== id) throw new Error('Service lease unavailable');
    if (this.current.status !== 'ready') return this.current;
    if (
      !this.current.pid ||
      !this.current.port ||
      !ownedLoopbackListener(this.current.pid, this.current.port)
    )
      throw new Error('Service lease is no longer listening');
    return this.current;
  }

  /** Returns a bounded excerpt of retained service output. */
  logs(id: string): { log: string; output: string } {
    const r = this.status(id);
    return { log: r.log, output: readFileSync(r.log).subarray(0, 16384).toString('utf8') };
  }

  /** Checks the required invariant before allowing the next transition. */
  async check(op: Operation, log: string, signal: AbortSignal): Promise<CommandResult> {
    if (op.kind !== 'http') throw new Error('Not an HTTP operation');
    const service = this.status(op.http.serviceId);
    if (service.status !== 'ready' || !service.port)
      throw new Error('HTTP check requires a ready service');
    const start = Date.now(),
      result = await localRequest(service.port, op.http.path, signal);
    writeFileSync(log, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
    return {
      command: 'HTTP GET',
      args: [`http://127.0.0.1:${service.port}${op.http.path}`],
      cwd: this.record.workspace,
      startedAt: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      exitCode: result.status === op.http.expectedStatus ? 0 : 1,
      log,
    };
  }

  /** Stops managed work and retains its final lifecycle evidence. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) {
      if (this.current?.error) throw new Error(this.current.error);
      return;
    }
    if (child.connected) child.send({ stop: true });
    await this.stopped;
    const current = this.current;
    if (current) {
      this.update(JSON.parse(readFileSync(current.recordPath, 'utf8')) as ServiceRecord);
      if (this.current!.status !== 'stopped' || !this.current!.endpointClosed)
        throw new Error('Service cleanup could not be verified');
    }
    this.child = undefined;
    if (this.current?.error) throw new Error(this.current.error);
  }
}
