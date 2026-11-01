# General agent execution

Issue #78 records this approved contract. Normal execution uses the shared project
host; legacy component, two-owner manifest and proposal execution are retired.
Historical inspection remains available. Phase three requires the final deterministic
and live qualification recorded in the [qualification ledger](../../plans/general-agent-execution-qualification.md).

## Public interface

`arcnexus workday start|pause|resume|stop|status` resolves the current project and
package without arguments or options. `arcnexus task run "<prompt>"` captures an
external goal and performs internal planning automatically. Existing diagnostics,
component testing and historical report inspection remain available.

A workday rotates fairly through eligible stewards. Each considers its purpose,
objectives, questions and inbox, proposes bounded useful work or records no action.
An unchanged full pass becomes idle. Relevant deliveries, verified changes and an
explicit resume wake work; there is no repeated inference against unchanged input.
A no-work stewardship result may name the reviewed owner without proposing an
assignment. This records consideration, not task decomposition or verified delivery.

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
Ready assignments use a persistent FIFO queue: a yielded continuation rejoins the
tail, and an already-ready assignment retains its place when unrelated state changes.
Dependency wakeups and clarification answers enter the same queue. Reopening the
store preserves that order; creation order alone must not starve later work.
The stewardship rotation also persists its last visited owner and continues after
that owner, even when an earlier owner receives new relevant input.

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
stable; candidate edits cannot redefine active authority. Policy and goal-assessment
workspaces are materialized from the pinned verified revision, not a delivery
workspace that might have changed later. Validate retained policy workspaces before
reuse. An integrity mismatch preserves evidence and requires attention; it must not
automatically resume a paused workday.

Trusted checks come from captured project declarations. General assignments run
the owner’s declared checks followed by checks from containing package/platform
definitions, deduplicated by executable and arguments. Owner check indices remain
stable for regression references. Container checks apply to the assembled candidate
and cannot be omitted because the selected owner’s own checks passed. Behavioral changes retain
expected-red regression evidence; other assignment kinds use appropriate workflows.
A separate read-only verifier assesses acceptance against observed evidence. Task
completion additionally requires director assessment. If that assessment identifies
missing goal coverage after deliveries, return its findings to the director for
additional bounded assignments against the current verified candidate. Preserve
earlier deliveries and the original goal; no completed checklist waives the missing
criteria. Unresolved blocked work also receives director diagnosis, with required
clarification/architectural decisions retained explicitly. Missing proof remains explicit.

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

## Project defaults

Committed `architecture/execution.yaml` selects `directorProfile`, `reviewerProfile`
and optional `defaultPackage`. ArcNexus uses its `astra` profile for direction and
independent review; owners retain their declared engineering profiles. Local machine
bindings are discovered at `<git-common-dir>/arcnexus/bindings.yaml`; `tools.codex`
selects a local executable. Captured bindings and profiles are immutable per run.
The normal interface does not accept work budgets; obsolete configured budget fields
produce an actionable migration error. Unknown execution-default keys are rejected
rather than ignored; malformed package selectors and verification paths fail preflight.

## Inbox decisions

The general result contract exposes correlated inbox decisions independently of
ordinary boundary requests. Recipients accept, reject or ask clarification; the
originating assignment answers in a read-only control activation. The host records
verified delivery itself. A completed model turn with outstanding structured requests
still yields the assignment; turn status never implies dependency delivery. Requests may deliberately link an existing assignment and
specify accepted intent or verified delivery as their required milestone. An inbox
reply must match its captured sender/recipient identities. A clarification does not
restart engineering or mark the original assignment complete.

Requests may narrow the recipient assignment with an explicit work kind, change
type and writable paths. Null values inherit the originating work kind/change type
and the recipient owner’s declared scope; an empty writable list is read-only.
These fields can only narrow captured recipient authority. A request for an actual
artifact uses the delivered milestone; accepted is reserved for dependencies that
need only an agreed intent. Independent delivery verification is automatic and
does not require a worker to invent a reviewer-owner assignment.

Captured verification inputs remain stable even when an assignment edits tests or
check configuration. `verificationInputs` in `architecture/execution.yaml` declares
additional trusted source paths used by project checks; the host also captures the
owner's existing test sources and tracked command-argument files automatically.
When these inputs change in a candidate, the host reruns checks with their captured
source contents restored temporarily, retaining both candidate and baseline results.
Worker regressions and independent review remain additional, distinguishable evidence.

## Supervising runner capture

Before launching a background host, the client captures the installed distribution,
package metadata and installed dependencies in private application state. The host
and its managed helpers execute from that retained copy. Rebuilding the caller’s
installation cannot replace a running host’s modules. Capture compares content
hashes before and after copying and refuses an installation that changes during
capture. Host evidence records the retained runner location and content hash.
Machine-bound external executables remain separately identified by captured bindings.

## Correcting blocked work

Direction may propose an explicit continuation of an existing assignment, with its
run-local assignment ID, owner and diagnosis. Stewardship may do the same for its
own owner. The host validates retained checkpoints before reactivating work; the
proposal cannot change its objective, acceptance criteria, plan, owner or scope.
Uncertain operations, changed candidates and incomplete workspace transitions still
require attention. Completed deliveries cannot be reopened.

A known rejected routing outcome may be replaced by a new activation after its
diagnosis is retained. Original requests and failure evidence remain inspectable.
Dependents return to waiting for the original required milestone; continuation is
neither acceptance nor delivery. Only assignments blocked by the resumed dependency
are released from that propagated block. Other independent failures remain blocked.
This allows an accepted request to be clarified and a rejected cycle proposal to be
restructured without inventing delivery or silently waiving the goal.

Recovery includes read-only policy activations as well as engineering assignments.
An unfinished director, stewardship or goal-assessment record is retained as an
interrupted activation. Its run cannot resume dispatch while operation completion
or the policy checkpoint remains uncertain. A completed policy record does not
block recovery; the host still validates the candidate and engineering checkpoints.
Stopping retains the uncertainty and evidence with the old workday. Starting a new
run uses only a compatible verified candidate, never unfinished policy state.

An inbox or verified-delivery transition that makes work relevant to an idle
workday atomically wakes that run. Idle ticks without changed input remain quiet.
Incoming work cannot override a user pause, a stop, an interruption or an attention
state; those lifecycle decisions continue to require their normal control flow.

Read-only stewardship preserves captured read authority and existing writable
locations as read-only inputs. A declared future-write directory that does not yet
exist grants no additional read access and is not created for policy inference.
Explicit read declarations must still resolve, and symlink/path violations remain
invalid. This permits every eligible owner to participate in stewardship before
its first test or documentation directory has been created.

Cancellation is idempotent at terminal task outcomes (#107). A late cancellation
cannot rewrite completed verification, failure, interruption or attention evidence.
Queued/running tasks and tasks awaiting input remain cancellable; managed execution
still receives prompt cancellation.

Every new run captures an execution identity covering committed authority, package
selection and resolved local bindings (#108). Recovery, continuation and dispatch
must compare that identity with the host's captured context before any new work.
Missing or mismatched identity requires attention and a new run; retain the old
candidate and evidence without importing the new source revision. Historical terminal
outcomes remain readable. A still-running original host may observe source drift,
but its captured authority and candidate never change silently.
