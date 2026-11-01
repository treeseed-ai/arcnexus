import { stripVTControlCharacters } from 'node:util';
import { createHash } from 'node:crypto';
import { save, type RecordData } from '../workspace/state.js';
import { observe } from './timeline.js';

interface ProgressState {
  failures: Record<string, number>;
  warnings: Array<{ action: string; diagnostic: string; count: number; observedAt: string }>;
  forbidden?: string;
  lastVerified?: { at: string; evidence: unknown };
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');
}

function diagnosticText(value: string): string {
  return stripVTControlCharacters(value)
    .replace(/duration_ms: [\d.]+/g, 'duration_ms: observed')
    .replace(/\(node:\d+\)/g, '(node)')
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'timestamp')
    .trim();
}

/** Records observable progress; never estimates private model reasoning. */
export class ProgressObserver {
  private readonly state: ProgressState;

  /** Restores recorded failure fingerprints and verified progress across session activations. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
  ) {
    this.state = (record.progress ??= { failures: {}, warnings: [] }) as ProgressState;
  }

  /** Fingerprints the next observable action before it can repeat a diagnosed failure. */
  before(action: unknown, candidate: string): void {
    if (this.state.forbidden === fingerprint({ action, candidate })) this.stop(action);
  }

  /** Records an equivalent failure and diagnoses repeated actions without progress. */
  failed(action: unknown, diagnostic: string, candidate: string): string | undefined {
    const normalized = diagnosticText(diagnostic);
    const key = fingerprint({ action, normalized, candidate });
    const count = (this.state.failures[key] = (this.state.failures[key] ?? 0) + 1);
    if (count < 3) return undefined;
    if (count > 3) this.stop(action);
    this.state.forbidden = fingerprint({ action, candidate });
    this.state.warnings.push({
      action: JSON.stringify(action),
      diagnostic: normalized,
      count,
      observedAt: new Date().toISOString(),
    });
    observe(this.root, this.record, 'progress.loop_warning', {
      action,
      diagnostic: normalized,
      count,
    });
    save(this.root, this.record);
    return 'Three equivalent failed actions without material progress. Diagnose the loop and choose a fundamentally different action; repeating it stops dispatch.';
  }

  /** Advances the progress baseline using independently observed state. */
  verified(evidence: unknown): void {
    if (fingerprint(this.state.lastVerified?.evidence) === fingerprint(evidence)) return;
    this.state.failures = {};
    delete this.state.forbidden;
    this.state.lastVerified = { at: new Date().toISOString(), evidence };
    observe(this.root, this.record, 'progress.verified', this.state.lastVerified);
    save(this.root, this.record);
  }

  /** Stops managed work and retains its final lifecycle evidence. */
  private stop(action: unknown): never {
    this.record.status = 'needs_attention';
    this.record.outcome = 'needs_attention';
    observe(this.root, this.record, 'progress.needs_attention', { action });
    save(this.root, this.record);
    const error = new Error('Loop requires a different action or caller attention');
    error.name = 'NeedsAttention';
    throw error;
  }
}
