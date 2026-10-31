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
