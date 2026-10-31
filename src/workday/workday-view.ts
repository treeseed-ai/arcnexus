import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { InputError } from '../architecture/config.js';
import { WorkdayStore } from '../coordination-store/workday-store.js';
import { processStart } from '../operations/service-state.js';
export async function viewWorkday(
  root: string,
  id: string,
  follow: boolean,
  json: boolean,
  after: number,
  signal: AbortSignal,
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new InputError('Invalid workday identity');
  let cursor = after;
  do {
    const store = new WorkdayStore(join(root, 'workdays', id, 'workday.sqlite'));
    let snapshot, events;
    try {
      snapshot = store.snapshot();
      events = store.events(cursor);
    } finally {
      store.close();
    }
    const host = (snapshot.workday.data as { host?: { pid: number; start: string } })?.host;
    const terminal = ['completed', 'failed', 'blocked', 'cancelled', 'budget_exhausted'].includes(
      String(snapshot.workday.status),
    );
    const interrupted = !terminal && !!host && processStart(host.pid) !== host.start;
    Object.assign(snapshot, { interrupted });
    if (!follow) {
      console.log(
        json
          ? JSON.stringify(snapshot)
          : `${id}: ${snapshot.workday.status}\n${JSON.stringify(snapshot, null, 2)}`,
      );
      return;
    }
    for (const event of events) {
      console.log(
        json
          ? JSON.stringify(event)
          : `${event.sequence} ${event.observedAt} ${event.type} ${JSON.stringify(event.payload)}`,
      );
      cursor = event.sequence;
    }
    if (terminal || interrupted) {
      if (interrupted)
        console.error('Workday interrupted; retained state is incomplete and cannot be resumed');
      return;
    }
    try {
      await delay(100, undefined, { signal });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  } while (!signal.aborted);
}
