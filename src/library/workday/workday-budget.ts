/** Pauses only while another assignment owns execution; the workday clock never pauses. */
export class ActiveBudget {
  private used = 0;

  private since: number | undefined;

  private timer: NodeJS.Timeout | undefined;

  private controller = new AbortController();

  readonly signal: AbortSignal;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    parent: AbortSignal,
    readonly limitMs?: number,
  ) {
    this.signal = AbortSignal.any([parent, this.controller.signal]);
  }

  /** Returns elapsed wall-clock time without interpreting it as completion percentage. */
  get elapsedMs() {
    return this.used + (this.since === undefined ? 0 : Date.now() - this.since);
  }

  /** Starts managed work and records the state needed for its later shutdown. */
  start() {
    if (this.since !== undefined) return;
    this.signal.throwIfAborted();
    if (this.limitMs !== undefined && this.used >= this.limitMs)
      throw new Error('Assignment active-time budget exhausted');
    this.since = Date.now();
    if (this.limitMs !== undefined)
      this.timer = setTimeout(
        () => this.controller.abort(new Error('Assignment active-time budget exhausted')),
        this.limitMs - this.used,
      );
  }

  /** Handles pause within this component’s captured contract. */
  pause() {
    if (this.since !== undefined) this.used += Date.now() - this.since;
    this.since = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
