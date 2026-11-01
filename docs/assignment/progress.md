# Progress-driven execution

Issue #65 replaces implicit execution budgets with optional caller-selected limits.
Migrated ArcNexus configuration has no default assignment/workday deadline, command,
setup, verification, HTTP or service-readiness timeout, turn/call quota or corrective
attempt quota. Existing explicitly declared limits remain visible and enforced;
missing legacy fields do not acquire hidden defaults. Historical reports remain readable.

Planned stages, expected-red verification, frozen checks, owner boundaries, independent
acceptance and review remain mandatory. Corrective work must have recorded findings and
a concrete repair objective. Waiting, handoff and checklist changes do not reset explicit
limits. Absent limits display as “not configured.” Cancellation, parent supervision,
service leases, output-size limits and process-group shutdown remain enforced. Shutdown
grace is resource cleanup, not a work budget. Silent work remains visible and cancellable.

## Loop guards

The host fingerprints observable actions using activity, normalized request, diagnostic
and relevant candidate/evidence state. Three equivalent failed actions without material
progress record a loop diagnosis and require a different next action. Repeating the same
failed action afterward stops dispatch with `needs_attention`, preserving evidence.
Repeated checkpoint cycles without verified progress are also detected. Unauthorized
requests remain immediate authority violations. Polling, following logs, readiness
observations and dependency waiting are excluded. Prose edits, checklist toggles and
timestamps alone do not prove progress. The host cannot observe private reasoning or
every internal Codex retry.

## Status and evidence

Status, follow and reports distinguish agent claims, observed actions and host verification.
They show current stage/command, elapsed time, last event, last verified progress,
checklist completed/remaining counts and revisions, loop warnings and cancellation.
Checklist progress includes its denominator. Unmeasurable work is indeterminate; elapsed
time is never converted into a fabricated percentage or ETA. Every exit retains work,
logs, plans and partial evidence. Only successful host checks establish completion.

## Operation transport

Codex documents a default per-tool MCP transport timeout separately from execution.
Long managed operations must survive transport response windows: bounded waits may
return an in-progress operation reference, which the steward observes until completion.
A response window does not terminate the command or service. Pending work is still
subject to cancellation, turn leases, parent loss and explicitly selected execution limits.
See the [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Test harnesses use explicit watchdogs to prevent stalled CI. Those limits are test
infrastructure, never runtime defaults.
