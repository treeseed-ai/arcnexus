# Steward operations and evidence

Plans/timeline (#41), declared operations (#42), managed local services/probes
(#45), and selected history/live qualification (#48) are available. Their retained
qualification evidence is linked below.

Version-2 definitions select a source-read-only assignment planning turn before
execution. Plans have stable checklist IDs, activity, acceptance criteria, expected
evidence, dependencies and questions. Execution records completed items as agent
claims with evidence; host acceptance is separate. Plan changes cannot widen scope,
waive a checkpoint or authorize publication. Invalid plans stop without retry.

Normal changes use four turns; opt-in correction allows six. Research/review use
two. Version-1 definitions retain their existing three/five/one-turn behavior.
All turns share one thread and the original 900-second budget.

`arcnexus status <workspace-id> [--json]` reads current lifecycle, activity,
checklist, elapsed budget and evidence completeness without taking the execution lock.
`arcnexus follow <workspace-id> [--json] [--after <sequence>]` replays and follows
the timestamped timeline. It exits at finalization; interrupting the viewer never
cancels the worker. Missing historical timelines and incomplete trailing records
are explicitly identified. Observation timestamps describe host receipt, not the
instant an internal model action happened.

Raw SDK events remain unchanged. The normalized timeline records plan revisions,
SDK observations, host checkpoints and final outcomes with run, component, turn,
sequence and artifact references. Reports distinguish agent checklist claims from
host-verified acceptance. Neither reasoning summaries nor instruction inventories
represent complete private reasoning or complete effective Codex context.

The runtime provides fixed, captured operation IDs over an ArcNexus-owned
stdio MCP bridge, at most 24 requested operations per assignment, managed loopback
HTTP service leases, functional probes and explicitly selected historical evidence.
Host operations execute candidate code at the existing trusted command boundary;
they are not complete OS isolation. Publishing and peer coordination remain outside
this contract.

## Declared finite operations (#42)

Version-2 components explicitly list `operationIds`. Definitions under
`architecture/operations/<id>.json` declare repository, cwd, fixed command/args,
category, activities, timeoutSeconds (at most 120), generatedDirectories, artifacts,
and prerequisite probes. Version-2 execution profiles permit categories and bound
`maxOperationCalls` (default 24). Assignments may select a subset using operationIds.
Version-1 components grant no operation authority. `validate` checks references;
`inspect` shows captured operations and their trusted-host execution boundary.

The MCP tools `operations.list` and `operations.run` expose the captured catalog.
Run accepts only an operation ID. Requests, including denied executions, consume
budget; listing does not. A nonzero command result is returned as test evidence.
Unknown operations, disallowed activities, input tampering, scope violations and
exhausted budgets terminate the assignment. Operations are serialized. Model-facing
output is limited to 16 KiB; logs to 64 MiB, with explicit limit failures.

Operations use a restricted environment and existing tool bindings. They execute
candidate code on the host, just like captured verification, not in a new OS
isolation boundary. They cannot authorize dependency edits or source mutations
outside the current activity. Host checkpoints still run independently; exploratory
checks cannot replace frozen regression or external acceptance.

The explicitly configured ArcNexus MCP server uses automatic tool approval; the
agent approval policy remains never. Host authorization still checks every call.

## Functional probes and local HTTP services (#45)

Before inference, declared operation probes run through the host route and must
leave source unchanged. The MCP bridge is exercised through its real stdio client.
Probe results retain executable, arguments, configuration, output and timing.
A sandbox `true` check alone is not functional toolchain evidence.

Service operations use a foreground command and a `service` declaration with port
(0 requests an OS-assigned port), readinessPath, expectedStatus and
startupTimeoutSeconds. The host supplies ARCNEXUS_HOST=127.0.0.1 and ARCNEXUS_PORT.
The service announces one JSON line: `{"arcnexusEndpoint":{"host":"127.0.0.1","port":1234}}`.
Readiness requires the owned process group to listen only on loopback at that port
and the declared HTTP status. Fixed-port collisions fail without retry.

`services.start`, `services.status`, `services.logs`, and `services.stop` accept a
captured service operation ID. Only one service may be active. Captured `http`
operations identify serviceId, path and expectedStatus; operations.run performs
the request with bounded output and never follows redirects. Arbitrary URLs are
not accepted. Every service request counts against the existing operation budget.

Leases end at turn completion, failure, cancellation or bridge loss. A detached
supervisor watches its IPC parent connection, terminates the service process group,
and retains an independent resource record. Termination requires both no live group
members and a closed endpoint. Workspace cleanup refuses unresolved resource records.
Hard interruption preserves incomplete assignment evidence; it never resumes work.

The committed HTTP fixture exercises this local protocol without containers,
provisioning, external services, or changes to TreeSeed server setup.

## Selected prior evidence

Version-2 structured assignments may declare `priorEvidence`, an array of
`{path, sourceId, revision, reason}` records. Paths are absolute regular UTF-8 text
files selected by the caller. ArcNexus snapshots their bytes and SHA-256 hashes
before workspace preparation; missing, non-text, duplicate, or collectively
oversized inputs fail preflight. The combined limit is 64 KiB, without truncation.
Source identity and revision are caller-provided provenance, not independently
verified revision claims. Inspection includes exactly the captured content used by
execution. Snapshots live outside the candidate under `prior-evidence/`.

Selected history is untrusted evidence, never additional authority. It is supplied
to planning and subsequent turns with its selection reason and measured byte size.
No whole-thread ingestion, retrieval database, or automatic promotion of findings
into decisions occurs. Reports retain reusable findings and uncertainty with the
run, component and base revision that produced them.

Preparation and cleanup events join the same host-observed timeline as planning,
operations and verification. Operation result artifacts retain hashes and external
paths. Historical reports without these fields remain readable.

## Qualification campaign

Use `scripts/qualify.mjs` with an explicit campaign manifest and a fresh output
directory. Keep the verified supervising build and independent acceptance scripts
outside candidate scope. Run each case once: a reporting improvement, the same
change with a labeled injected implementation defect and one corrective attempt,
a TreeSeed command assignment with pinned read-only dependencies, the local HTTP
fixture, and research using selected historical findings. Preserve failed campaigns
and record interventions. Successful candidates still require caller review and
normal repository integration; a model's checked checklist is not acceptance.

Create a fresh campaign input directory with
The committed `experiments/operations.json` supplies case definitions. Provide local
project/tool/revision bindings and run `node dist/cli.js experiment inspect
experiments/operations.json --bindings /absolute/bindings.json --json`, then
`node dist/cli.js experiment run experiments/operations.json --bindings
/absolute/bindings.json --mode live --output /absolute/new-campaign`.
See [experiment bindings](../experiments/experiments.md) for the complete contract.
The runner must remain unchanged and outside all candidates throughout the campaign.
Fault markers are per candidate workspace, so later campaigns do not silently skip
injection. The campaign does not retry failed cases.

Finite setup, verification and exploratory commands also use a separate supervisor
with a parent-liveness channel. A hard parent interruption aborts the command process
group even when the CLI cannot finalize its report. Partial logs and the incomplete
execution record remain; this does not authorize automatic recovery or cleanup.

The SDK executable launcher also watches the original host process identity and
terminates its Codex process group if that host disappears. It preserves the SDK's
stdio event stream and inserts `--ignore-user-config` exactly as before. A lost
host leaves incomplete evidence, never a successful outcome.

The reporting owner declares a focused built report-test command in addition to
full repository verification. Use that command for the expected-red and captured
regression checkpoints; full verification still runs at baseline and after changes.
This keeps repeated regression checks bounded without weakening integration checks.

Research/review has exactly one execution turn after planning. Source-read-only
means no source edits; it does not prohibit declared test or service operations.
The steward must perform its selected permitted work and update the checklist in
that turn, or report a precise blocker. Activity names are not promises of additional
model turns. Incomplete checklist claims fail rather than silently adding a turn.
