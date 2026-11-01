# Execution CLI migration

Issue #106 finishes the normal-interface migration in #78. Engineering execution
uses the project host, durable assignment scheduler and task director. Workday
policy supplies stewardship turns to that same host.

The public execution commands are exactly `task run "<prompt>"` and `workday
start|pause|resume|stop|status`. Legacy component `run`, manifest `workday run`,
`task plan` and `task legacy-run` return an input error explaining the replacement,
before creating a workspace or calling a model. Historical workday/proposal and
worker report inspection remains read-only. `prepare` remains a workspace diagnostic,
not an alternate engineering entry point.

Active campaigns use schema version 3: prompts and expected terminal outcomes,
with project declarations supplying owners, profiles and verification. Retained
version-1/2 manifests may be inspected for historical evidence; executing them
requires migration and cannot invoke the retired recursive two-owner runner.
Historical reports retain their original interpretation and are never hydrated as
new scheduler state.

Migrate useful scenarios, not old quotas: success and correction, rejected/unknown
dependencies, captured verification failures, pending operations, scope enforcement,
cancellation, stable supervising code and honest evidence labeling remain covered.
Low-level steward and host-check characterization can exercise their public session
API directly. Shared-engine acceptance proves multi-owner delivery and CLI behavior.
Do not retain an executable fixed-participant scheduler to keep obsolete tests green.

Bundled live examples must select the general configured fixture or an explicitly
bound clean configured target. Earlier fixed-revision qualification manifests are
historical evidence recipes; they are not ready-to-run instructions for new modes.
No scripted campaign counts as a live gate.
