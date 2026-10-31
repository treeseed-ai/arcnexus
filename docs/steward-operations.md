# Planned steward operations and evidence

This contract is being delivered in four increments: plans/timeline (#41), declared
operations, managed local services/probes, and selected history/live qualification.
Unimplemented increments are not available capabilities.

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

Later increments provide fixed, captured operation IDs over an ArcNexus-owned
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
