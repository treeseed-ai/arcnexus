import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

export interface ServiceRecord {
  id: string;
  runId: string;
  status: string;
  supervisorPid: number;
  pid?: number;
  startTime?: string;
  port?: number;
  log: string;
  recordPath: string;
  startedAt: string;
  finishedAt?: string;
  endpointClosed?: boolean;
  error?: string;
}

export function groupMembers(group: number): number[] {
  const members: number[] = [];
  for (const name of readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    try {
      const fields = readFileSync(`/proc/${name}/stat`, 'utf8').split(') ')[1]!.split(' ');
      if (Number(fields[2]) === group && fields[0] !== 'Z') members.push(Number(name));
    } catch {}
  }
  return members;
}

export function processStart(pid: number): string | undefined {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]!.split(' ')[19];
  } catch {
    return undefined;
  }
}

export function ownedLoopbackListener(pid: number, port: number): boolean {
  const inodes = new Set<string>();
  for (const member of groupMembers(pid)) {
    try {
      for (const fd of readdirSync(`/proc/${member}/fd`)) {
        try {
          const link = readlinkSync(`/proc/${member}/fd/${fd}`);
          const match = link.match(/^socket:\[(\d+)\]$/);
          if (match) inodes.add(match[1]!);
        } catch {}
      }
    } catch {}
  }
  let found = false;
  for (const path of ['/proc/net/tcp', '/proc/net/tcp6'])
    for (const row of readFileSync(path, 'utf8').trim().split('\n').slice(1)) {
      const fields = row.trim().split(/\s+/);
      if (fields[3] !== '0A' || !inodes.has(fields[9]!)) continue;
      const [address, hexPort] = fields[1]!.split(':');
      if (address !== '0100007F' && address !== '00000000000000000000000001000000')
        throw new Error('Owned service listener is not loopback');
      if (parseInt(hexPort!, 16) === port) found = true;
    }
  return found;
}

export function endpointClosed(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let finished = false;
    const done = (closed: boolean) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(closed);
    };
    socket.once('connect', () => done(false));
    socket.once('error', (error) => done((error as NodeJS.ErrnoException).code === 'ECONNREFUSED'));
    socket.setTimeout(500, () => done(false));
  });
}

export function assertServicesStopped(root: string, id: string): void {
  const directory = join(root, 'runs', id, 'services');
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory).filter((n) => n.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(directory, name), 'utf8')) as ServiceRecord;
    if (r.runId !== id || r.status !== 'stopped' || r.endpointClosed !== true)
      throw new Error('Service resource ownership/liveness is unresolved');
    if (r.pid && processStart(r.pid) === r.startTime && groupMembers(r.pid).length)
      throw new Error('Managed service is still alive');
  }
}
