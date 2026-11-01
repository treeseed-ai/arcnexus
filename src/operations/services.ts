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
  startupTimeoutSeconds: number;
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
    req.setTimeout(1000, () => req.destroy(new Error('HTTP request timed out')));
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
export class ServiceManager {
  private child?: ChildProcess;
  private current?: ServiceRecord;
  private stopped?: Promise<void>;
  constructor(
    private root: string,
    private record: RecordData,
    private signal: AbortSignal,
  ) {
    record.services ??= [];
  }
  private update(value: ServiceRecord) {
    this.current = value;
    const records = this.record.services as ServiceRecord[],
      index = records.findIndex((r) => r.recordPath === value.recordPath);
    if (index < 0) records.push(value);
    else records[index] = value;
    observe(this.root, this.record, 'service.' + value.status, value);
    save(this.root, this.record);
  }
  async start(op: Operation): Promise<ServiceRecord> {
    if (op.kind !== 'service' || !op.service) throw new Error('Not a service operation');
    if (this.child) throw new Error('Only one active service lease is permitted');
    const record = this.createRecord(op.id);
    const child = this.launch(op, record);
    try {
      return await this.awaitReadiness(op, child);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
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
  private launch(op: Extract<Operation, { command: string }>, record: ServiceRecord): ChildProcess {
    const cwd = realpathSync(join(this.record.workspace, op.cwd));
    if (relative(this.record.workspace, cwd).startsWith('..'))
      throw new Error('Service working directory escapes workspace');
    const child = fork(fileURLToPath(new URL('./service-supervisor.js', import.meta.url)), [], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: operationEnvironment(this.record),
    });
    this.child = child;
    this.current = record;
    child.on('error', () => {});
    this.stopped = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.on('message', (message: { record?: ServiceRecord }) => {
      if (message.record) this.update(message.record);
    });
    this.watchCancellation(child);
    const command = targetCommand(this.record, {
      command: op.command,
      args: op.args.map((a) => (a === '{workspace}' ? this.record.workspace : a)),
    });
    child.send({
      record,
      ...command,
      cwd,
      env: operationEnvironment(this.record),
      port: op.service!.port,
    });
    return child;
  }
  private watchCancellation(child: ChildProcess): void {
    const abort = () => {
      void this.stop().catch(() => {});
    };
    this.signal.addEventListener('abort', abort, { once: true });
    child.once('close', () => this.signal.removeEventListener('abort', abort));
  }
  private async awaitReadiness(
    op: Extract<Operation, { command: string }>,
    child: ChildProcess,
  ): Promise<ServiceRecord> {
    const service = op.service!;
    const start = Date.now();
    while (Date.now() - start < service.startupTimeoutSeconds * 1000) {
      this.signal.throwIfAborted();
      const record = this.current!;
      if (child.exitCode !== null || record.status === 'stopped' || record.status === 'unresolved')
        throw new Error(record.error ?? 'Service supervisor exited');
      if (await this.isReady(record, service)) {
        this.update({ ...record, status: 'ready' });
        return this.current!;
      }
      await delay(50, undefined, { signal: this.signal });
    }
    throw new Error('Service readiness timed out');
  }
  private async isReady(record: ServiceRecord, service: ServiceDefinition): Promise<boolean> {
    if (!record.pid || !record.port || !ownedLoopbackListener(record.pid, record.port))
      return false;
    try {
      const response = await localRequest(record.port, service.readinessPath, this.signal);
      return response.status === service.expectedStatus;
    } catch (error) {
      this.signal.throwIfAborted();
      if (String(error).includes('redirect')) throw error;
      return false;
    }
  }
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
  logs(id: string): { log: string; output: string } {
    const r = this.status(id);
    return { log: r.log, output: readFileSync(r.log).subarray(0, 16384).toString('utf8') };
  }
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
