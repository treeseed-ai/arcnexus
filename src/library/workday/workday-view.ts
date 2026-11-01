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
  return new WorkdayViewer(root, id, json, after, signal).view(follow);
}

/** Reads SQLite coordination state and follows ordered events without activating stewards. */
class WorkdayViewer {
  /** Retains viewer format, event cursor and independent viewer cancellation. */
  constructor(
    private root: string,
    private id: string,
    private json: boolean,
    private cursor: number,
    private signal: AbortSignal,
  ) {}

  /** Loads the requested content through this component boundary. */
  private read() {
    const store = new WorkdayStore(join(this.root, 'workdays', this.id, 'workday.sqlite'));
    try {
      const snapshot = store.snapshot(),
        events = store.events(this.cursor);
      const host = (snapshot.workday.data as { host?: { pid: number; start: string } })?.host;
      const terminal = ['completed', 'failed', 'blocked', 'cancelled', 'budget_exhausted'].includes(
        String(snapshot.workday.status),
      );
      const interrupted = !terminal && !!host && processStart(host.pid) !== host.start;
      return { snapshot: Object.assign(snapshot, { interrupted }), events, terminal, interrupted };
    } finally {
      store.close();
    }
  }

  /** Reads retained state and optionally follows until terminal outcome or viewer cancellation. */
  async view(follow: boolean): Promise<void> {
    do {
      const { snapshot, events, terminal, interrupted } = this.read();
      if (!follow) {
        console.log(
          this.json
            ? JSON.stringify(snapshot)
            : `${this.id}: ${snapshot.workday.status}\n${JSON.stringify(snapshot, null, 2)}`,
        );
        return;
      }
      this.emit(events);
      if (terminal || interrupted) {
        if (interrupted)
          console.error('Workday interrupted; retained state is incomplete and cannot be resumed');
        return;
      }
      try {
        await delay(100, undefined, { signal: this.signal });
      } catch (error) {
        if (this.signal.aborted) return;
        throw error;
      }
    } while (!this.signal.aborted);
  }

  /** Formats one observed state or event without changing workday execution. */
  private emit(events: ReturnType<WorkdayStore['events']>): void {
    for (const event of events) {
      console.log(
        this.json
          ? JSON.stringify(event)
          : `${event.sequence} ${event.observedAt} ${event.type} ${JSON.stringify(event.payload)}`,
      );
      this.cursor = event.sequence;
    }
  }
}
