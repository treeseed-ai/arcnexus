import { materialCandidate } from '../change-inspection/changes.js';
import { ProgressObserver } from '../report/progress.js';
import type { SessionState } from './session-state.js';

/** Tracks observable failures and verified progress without inferring private reasoning. */
export class SessionProgress {
  private readonly observer: ProgressObserver;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(private readonly state: SessionState) {
    this.observer = new ProgressObserver(state.options.root, state.options.record);
  }

  /** Records equivalent observable failures for loop diagnosis. */
  failure(activity: string, diagnostic: string, log?: string): string {
    const warning = this.observer.failed(
      { activity },
      diagnostic,
      'no-verified-checkpoint-progress',
    );
    const feedback = warning ? `${diagnostic}\n${warning}` : diagnostic;
    return log ? `${feedback}\nFull retained log: ${log}` : feedback;
  }

  /** Records host-verified progress rather than checklist toggles or changed prose. */
  verified(checkpoint: string): void {
    this.observer.verified({ checkpoint, candidate: materialCandidate(this.state.options.record) });
  }
}
