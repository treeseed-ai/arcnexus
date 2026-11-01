import type { ThreadEvent } from '@openai/codex-sdk';
import { materialCandidate } from '../change-inspection/changes.js';
import { ProgressObserver } from '../report/progress.js';
import type { RecordData } from '../workspace/state.js';

/** Only exposed completed shell events are visible; internal model retries remain opaque. */
export class ObservedProgress {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private root: string,
    private record: RecordData,
  ) {}

  /** Handles accept within this component’s captured contract. */
  accept(event: ThreadEvent): void {
    if (event.type !== 'item.completed' || event.item.type !== 'command_execution') return;
    const item = event.item;
    if (item.exit_code === 0 || (item.status !== 'failed' && item.exit_code === undefined)) return;
    const observer = new ProgressObserver(this.root, this.record);
    const action = { activity: this.record.stage, shell: item.command.trim().replace(/\s+/g, ' ') };
    const candidate = materialCandidate(this.record);
    observer.before(action, candidate);
    observer.failed(action, item.aggregated_output, candidate);
  }
}
