# Durable assignment activations

General execution (#78) advances one workflow stage per scheduler activation.
The saved next stage, thread, plan, frozen regression, attempt history and pending
requests survive process reopening. Yielding a dependency does not advance the
stage or reset evidence. The requesting stage continues after verified delivery.
Host checks finish before a stage checkpoint is declared safe for pause.

A retained activation must match captured authority and candidate identity before
continuing. Model claims never bypass specification or final verification. Existing
standalone workflows continue to use the same stage implementations.

Behavior-preserving refactors declare `changeType: refactor`. Their preparation
checkpoint references the existing contract, adds characterization coverage only
where missing, and observes passing captured checks before implementation. Retain
those test sources outside the candidate and rerun them after implementation. A
refactor does not require manufactured changed documentation or an expected-red
behavioral assertion. Independent verification still checks the original criteria.

A missing retained model thread is distinct from an uncertain model turn. The host
may replace a thread only after an explicit thread/session-not-found response,
before any model activity or operation, and with an unchanged checkpoint candidate.
It records the old identity and reason and supplies captured continuation evidence
to the fresh thread. Transport errors, partial turns and uncertain operations do
not permit automatic replay.

A rejected plan at an unchanged read-only planning boundary is corrective feedback,
not delivery and not a reason to discard the assignment. Preserve the thread and
planning stage, return the exact semantic/schema validation error, and accept a
replacement only when it covers every criterion under the same authority. Apply
the existing equivalent-failure diagnosis; do not introduce a retry allowance.
Filesystem, permission, operation and transport errors do not use this path.

Captured acceptance restores declared test/verification inputs and tracked files
named directly by check commands. Directory-valued command arguments such as
`--project .` do not expand that automatic file capture to the whole repository.
The implementation under test remains the candidate implementation while captured
checks run; restoring a baseline implementation would not establish its acceptance.
Unchanged captured inputs need no separate frozen-check pass.

A semantic checklist error in a completed, scope-checked model response is a
correctable result. Retain the accepted plan, stage, thread, partial edits and
observed command evidence; return the exact diagnostic on the next activation.
Reject the whole invalid update batch before persisting any accepted-plan changes.
This safe correction applies only after the model and owned operations have ended
and source scope has been checked. It does not apply to transport, filesystem,
authority or uncertain-operation failures. Equivalent repeated errors use the
existing progress diagnosis rule, with no corrective-attempt quota.

General inbox requests remain available independently of the legacy coordination
protocol's action list. The model uses structured requests for eligible owners and
inboxActions for correlated responses; an empty legacy action list does not disable
these capabilities.

A completed model response that reports a blocker is a durable blocked assignment
outcome after scope and owned-operation checks. Retain its safe checkpoint so a
later diagnosed continuation can use the same plan, thread and partial work.
This does not satisfy a dependency or claim delivery. Incomplete execution and
authority violations remain unsafe. Dependency context distinguishes accepted
intent from verified delivery; only completed deliveries receive the latter label.
To wait for a stronger milestone, the worker explicitly requests that milestone
against the same accepted assignment and matching scope/acceptance conditions.

Worker response schemas advertise only activities permitted by the captured role,
including plan activities. Review and caller handoff do not require publication or
an additional role permission. Host validation remains authoritative even when a
response bypasses the constrained schema.

Independent verification progress is measured by unresolved criterion identities
and the reviewed candidate, not by the reviewer's wording. Rephrased summaries or
evidence descriptions do not establish material progress. Three equivalent reviews
of the same unchanged candidate require diagnosis; continued repetition without a
material change stops the affected work with retained attention evidence. Passing
other checks or changing checklist prose cannot clear this review history. A conflict
between a worker-authored regression and original acceptance remains explicit; the
runtime must not silently recapture weaker tests to bypass that conflict.

A verified dependency supplies its readable independent assessment, reviewed
candidate identity, criterion coverage and observed check evidence to its consumers.
A private report path alone is not usable delivery evidence. Validate every referenced
assessment against the current run, recipient assignment, worker parent record and
verifier role before exposing it. Reject arbitrary or foreign report references.

Execution evidence includes the original accepted routing decision and the captured
owner context supplied to each activation. Persisted requests to owners absent from
the starting selection establish dynamic activation. They do not expose private
reasoning or prove an explicitly required API inspection; use actual tool observations
for the latter. Do not add a separate retrieval ceremony when the relevant owner
catalog was already present in captured activation context.

A completed, scope-checked expected-regression mismatch is correctable at the
specification checkpoint (#105). Preserve the plan, thread, specification edits
and observed command, and return its exact diagnostic for another specification
activation. Implementation remains unavailable until literal expected-failure
matching succeeds. Repeated equivalent mismatches require progress diagnosis;
transport, cancellation, authority and uncertain-operation failures remain unsafe.
