/** Pauses only while another assignment owns execution; the workday clock never pauses. */
export class ActiveBudget {
  private used = 0;
  private since: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private controller = new AbortController();
  readonly signal: AbortSignal;
  constructor(
    parent: AbortSignal,
    readonly limitMs?: number,
  ) {
    this.signal = AbortSignal.any([parent, this.controller.signal]);
  }
  get elapsedMs() {
    return this.used + (this.since === undefined ? 0 : Date.now() - this.since);
  }
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
  pause() {
    if (this.since !== undefined) this.used += Date.now() - this.since;
    this.since = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
