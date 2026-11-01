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
