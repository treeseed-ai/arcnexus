import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, openSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { endpointClosed, groupMembers, processStart, type ServiceRecord } from './service-state.js';

interface Start {
  record: ServiceRecord;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  port: number;
}

/** Owns the foreground service process and stops its group after parent loss. */
class ServiceSupervisor {
  private child?: ChildProcess;

  private record?: ServiceRecord;

  private fd?: number;

  private stopping?: Promise<void>;

  private bytes = 0;

  private line = '';

  private requestedPort = 0;

  /** Registers parent-liveness and service-process event handlers. */
  listen(): void {
    process.on('disconnect', () => {
      void this.stop('parent disconnected');
    });
    process.on('SIGTERM', () => {
      void this.stop('supervisor terminated');
    });
    process.on('message', (message: Start | { stop: true }) => {
      if ('stop' in message) void this.stop('lease ended');
      else if (!this.record) this.start(message);
    });
  }

  /** Writes current service ownership and lifecycle evidence for inspection. */
  private persist(): void {
    if (!this.record) return;
    writeFileSync(this.record.recordPath + '.tmp', JSON.stringify(this.record, null, 2), {
      mode: 0o600,
    });
    renameSync(this.record.recordPath + '.tmp', this.record.recordPath);
  }

  /** Stops managed work and retains its final lifecycle evidence. */
  private stop(reason: string): Promise<void> {
    return (this.stopping ??= this.shutdown(reason));
  }

  /** Terminates the service process group after cancellation or parent loss. */
  private async shutdown(reason: string): Promise<void> {
    if (!this.record) {
      process.disconnect?.();
      return;
    }
    const record = this.record;
    record.status = 'stopping';
    record.error ??= reason === 'lease ended' ? undefined : reason;
    this.persist();
    const pid = this.child?.pid;
    if (pid) await this.stopGroup(pid);
    record.endpointClosed = record.port ? await endpointClosed(record.port) : true;
    record.status =
      (!pid || !groupMembers(pid).length) && record.endpointClosed ? 'stopped' : 'unresolved';
    record.finishedAt = new Date().toISOString();
    this.persist();
    if (this.fd !== undefined) {
      closeSync(this.fd);
      this.fd = undefined;
    }
    if (process.connected) {
      process.send?.({ type: 'stopped', record });
      process.disconnect();
    }
  }

  /** Stops the process group while preserving shutdown evidence. */
  private async stopGroup(pid: number): Promise<void> {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* Group may already be gone. */
    }
    await delay(300);
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* Group may already be gone. */
    }
    for (let i = 0; i < 20 && groupMembers(pid).length; i++) await delay(50);
  }

  /** Starts managed work and records the state needed for its later shutdown. */
  private start(message: Start): void {
    this.record = { ...message.record, supervisorPid: process.pid, status: 'starting' };
    this.requestedPort = message.port;
    this.persist();
    this.fd = openSync(this.record.log, 'wx', 0o600);
    this.child = spawn(message.command, message.args, {
      cwd: message.cwd,
      env: { ...message.env, ARCNEXUS_HOST: '127.0.0.1', ARCNEXUS_PORT: String(message.port) },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.record.pid = this.child.pid;
    this.record.startTime = this.child.pid ? processStart(this.child.pid) : undefined;
    this.persist();
    this.child.stdout!.on('data', (chunk) => this.capture(chunk, true));
    this.child.stderr!.on('data', (chunk) => this.capture(chunk, false));
    this.child.on('error', (error) => {
      void this.stop(String(error));
    });
    this.child.on('close', (code) => {
      if (!this.stopping) void this.stop(`Service exited unexpectedly (${code})`);
    });
  }

  /** Snapshots the inputs used by later verification. */
  private capture(chunk: Buffer, stdout: boolean): void {
    if (this.fd === undefined) return;
    const room = 64 * 1024 * 1024 - this.bytes;
    if (room > 0) writeSync(this.fd, chunk.subarray(0, room));
    this.bytes += chunk.length;
    if (this.bytes > 64 * 1024 * 1024) {
      void this.stop('Service output limit exceeded');
      return;
    }
    if (stdout) this.announcements(chunk);
  }

  /** Parses complete stdout lines for the declared endpoint announcement. */
  private announcements(chunk: Buffer): void {
    this.line += chunk.toString();
    if (this.line.length > 65536) {
      this.line = '';
      return;
    }
    let end: number;
    while ((end = this.line.indexOf('\n')) >= 0) {
      const text = this.line.slice(0, end);
      this.line = this.line.slice(end + 1);
      this.announcement(text);
    }
  }

  /** Validates an announced loopback endpoint before reporting readiness. */
  private announcement(text: string): void {
    try {
      const endpoint = JSON.parse(text).arcnexusEndpoint;
      if (!endpoint) return;
      if (
        endpoint.host !== '127.0.0.1' ||
        !Number.isInteger(endpoint.port) ||
        endpoint.port < 1 ||
        endpoint.port > 65535 ||
        (this.requestedPort && endpoint.port !== this.requestedPort)
      )
        throw new Error('Invalid service endpoint announcement');
      if (this.record!.port) return;
      this.record!.port = endpoint.port;
      this.persist();
      process.send?.({ type: 'endpoint', record: this.record });
    } catch (error) {
      if (text.includes('arcnexusEndpoint')) void this.stop(String(error));
    }
  }
}

new ServiceSupervisor().listen();
