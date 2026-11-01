import { materialCandidate } from '../change-inspection/changes.js';
import { ProgressObserver } from '../report/progress.js';
import type { SessionState } from './session-state.js';
export class SessionProgress {
  private readonly observer: ProgressObserver;
  constructor(private readonly state: SessionState) {
    this.observer = new ProgressObserver(state.options.root, state.options.record);
  }
  failure(activity: string, diagnostic: string): string {
    const warning = this.observer.failed(
      { activity },
      diagnostic,
      'no-verified-checkpoint-progress',
    );
    return warning ? `${diagnostic}\n${warning}` : diagnostic;
  }
  verified(checkpoint: string): void {
    this.observer.verified({ checkpoint, candidate: materialCandidate(this.state.options.record) });
  }
}
