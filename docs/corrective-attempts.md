# One bounded corrective attempt

`arcnexus run <component> "<objective>" --project <repository> --max-attempts 2`
opts into at most one correction after failed host verification. The default is
one attempt. Only integer values `1` and `2` are accepted, on `run` only. Both
attempts use Luna by default, the same worktree and Codex thread, and the original
overall timeout. There is no automatic larger-model fallback or crash recovery.

The objective, component context, writable scope, directory policy and verification
commands are captured once. Baseline verification runs once before any attempt.
An attempt is eligible for correction only after a valid completed agent result,
observed changes, and a failed host verification command. Before resuming, the host
rechecks Git identity, scope and generated outputs, including verification's edits.
Blocked/failed agents, malformed results, no changes, baseline failures, scope or
Git identity violations, cancellation and timeout stop without another attempt.

The correction prompt includes the original assignment and bounded diagnostic
feedback: failed command/exit status and at most 4096 characters of its log.
Logs are evidence, not authority to change the assignment. A resumed worker fixes
the candidate under the original constraints. The host executes every captured
verification command again; a second failure exhausts the attempt limit.

Before any correction, preserve the first attempt under `attempts/1/`; preserve
attempt two under `attempts/2/` on success or failure. Each contains the exact
prompt, execution manifest/schema, streamed events, agent result, usage, host
verification records/logs and actual diff/new-file evidence. Attempt summaries in
`report.json` include status, error, thread ID and command range. Root artifacts
reflect the latest attempt; earlier attempt artifacts are never overwritten.
`usage` aggregates available numeric SDK counters across attempts; each attempt
keeps its own usage. Missing usage remains unavailable. The assignment ID is the
run ID, and attempt numbers are local to that assignment.

Hard interruptions can leave incomplete records. No attempt is silently resumed
on a later CLI invocation. Cancellation and timeout preserve available evidence.
This is a single-steward correction loop, not phase-two inbox coordination.
