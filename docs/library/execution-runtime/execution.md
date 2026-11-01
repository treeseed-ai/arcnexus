# General agent execution

Issue #78 records this approved contract. It is under implementation; the legacy
two-owner CLI remains available until its callers migrate. Phase three is blocked
until deterministic and live qualification establish the behavior below.

## Public interface

`arcnexus workday start|pause|resume|stop|status` resolves the current project and
package without arguments or options. `arcnexus task run "<prompt>"` captures an
external goal and performs internal planning automatically. Existing diagnostics,
component testing and historical report inspection remain available.

A workday rotates fairly through eligible stewards. Each considers its purpose,
objectives, questions and inbox, proposes bounded useful work or records no action.
An unchanged full pass becomes idle. Relevant deliveries, verified changes and an
explicit resume wake work; there is no repeated inference against unchanged input.

A task director selects starting owners and retains goal acceptance. Owners can
request additional existing package owners. A task pauses a running workday at a
safe checkpoint and resumes it afterward, unless a user pause/stop or integrity
problem intervened. Interactive task questions retain the same task; noninteractive
questions retain needs_input evidence. Additional tasks queue FIFO.

## Execution and authority

One background host owns each canonical repository and executes one activation at
a time. No participant count is hardcoded. Assignments, stewards, activations,
messages, dependencies and candidate revisions have distinct identities. A steward
may own several assignments. Durable delivery and readiness commit atomically.

Requests carry originating assignment, recipient owner, purpose, expected outcome,
acceptance and required milestone. Acceptance is intent, not verified delivery.
Support nested dependencies, fan-out/fan-in, rejection, clarification and duplicate
delivery protection. Reject blocking cycles with retained evidence. Unrelated ready
work continues when another assignment is blocked. Unknown owners and expanded
authority require the architect; relationships aid discovery rather than grant writes.

Use isolated assignment workspaces and one accumulated verified candidate. Preserve
unfinished edits; reconcile against the current candidate without silent overwrite.
Recheck assembled changes before promotion. Workers cannot publish, switch branches
or commit. Captured architecture, instructions, checks and supervising build remain
stable; candidate edits cannot redefine active authority.

Trusted checks come from captured project declarations. Behavioral changes retain
expected-red regression evidence; other assignment kinds use appropriate workflows.
A separate read-only verifier assesses acceptance against observed evidence. Task
completion additionally requires director assessment. Missing proof remains explicit.

## Lifecycle

Workdays expose running, idle, pausing, paused, stopping, stopped, interrupted and
needs_attention states. Pause stops new dispatch and finishes the active checkpoint;
stop cancels promptly and preserves partial evidence. Repeated controls are idempotent.
A stopped workday cannot resume. Starting again may reuse compatible verified results,
but must not silently restart old unfinished assignments.

Remove work deadlines and turn/call/attempt quotas. Keep elapsed-time telemetry,
progress loop detection, cancellation, transport/cleanup safeguards and test watchdogs.
Obsolete executable limit configuration receives migration diagnostics; historical
reports remain readable. A missing model thread can be replaced from validated
checkpoint context with recorded provenance. An uncertain operation is never replayed.

## Delivery and qualification

Implement in verified slices: general scheduling; durable continuation/candidates;
automatic acceptance and tasks; persistent workdays; mode coordination and migration;
live qualification. Bootstrap the orchestration where the current runtime cannot
reliably implement it; use ArcNexus itself for bounded work as soon as it can.

Deterministic built-program acceptance covers three/five owners, nested and shared
dependencies, repeated owners, duplicate delivery, cycles/rejection, unrelated progress,
conflicts, restart transitions, controls, task/workday overlap, idle/wakeup and captured
authority. Run formatting, lint, strict typing, build, ownership/guidance validation
and affected component tests, then the integrated suite.

Live gates require a real three-owner prompt with dynamically discovered ownership,
self-directed verified improvement, inbox delivery, pause/resume, task interruption
and return, cancellation/recovery, and a real ArcNexus improvement under a stable
supervising build. Retain actual diffs, host results and independent verification.
Report simulation, local checks, CI and live evidence separately.
