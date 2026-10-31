> The [activity workflow](steward-workflow.md) supersedes the historical one-turn
> attempt layout below. `--max-attempts 2` still permits only one corrective
> implementation, but planned activity turns now have separate evidence.

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
`usage` records the latest cumulative thread counters, and each attempt keeps
its delta plus `reportedUsage` exactly as emitted. Missing or decreasing counters
make the attempt delta unavailable; they are never silently treated as zero. The assignment ID is the
run ID, and attempt numbers are local to that assignment.

Hard interruptions can leave incomplete records. No attempt is silently resumed
on a later CLI invocation. Cancellation and timeout preserve available evidence.
This is a single-steward correction loop, not phase-two inbox coordination.

## Usage compatibility finding

With SDK 0.166.0 and Codex 0.163.0-alpha.10.2, a live `exec resume` emitted
thread-cumulative `turn.completed.usage`, despite the SDK type comments describing
turn usage. The local rollout's `total_token_usage` confirmed this: 81,398 input
tokens after attempt one, 98,888 after attempt two, with 17,490 additional input
tokens on the resumed attempt. Adding the two emitted totals would double-count
the first attempt. Tests replay these exact counters through the SDK executable
boundary; raw event logs remain unchanged. This is the accounting contract for the
tested CLI, not a claim about every alternate executable or future CLI version.
The [official SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) establishes
the resume interface but does not resolve this counter discrepancy.

## Acceptance evidence

The built CLI passed 78 deterministic runtime tests, including successful resume,
exhaustion, default single attempt, unsafe outcomes, verification-created scope
violations, stale evidence, unexpected thread IDs, and cancellation/timeout during
attempt two. Twelve independent external checks also passed. TypeScript/build,
Python repository checks and CLI help smoke checks passed separately.

Live Luna run `5ae2a1af-14d1-4048-902a-00710dabe3a8` completed two attempts on
thread `01a18fe8-bc06-7700-a707-0ef8c6afbc96` in one worktree. This was a controlled
acceptance fixture: the host deliberately failed its first final check once, then
accepted the unchanged valid documentation. The external counter confirmed exactly
one baseline and two final checks. It proves live resume and feedback delivery,
not a spontaneous model defect repair; deterministic tests cover actual repair.
The original report retains the pre-fix usage overcount. Its raw counters drove the
accounting correction above, verified by executable replay without more inference.

Luna run `bf247590-2c2e-4fb7-aff2-7f58aa1a5111` supplied the initial implementation.
Host verification caught two flawed test setups. Caller review then tightened
attempt evidence, thread identity and final no-change checks, and corrected usage
accounting after live inspection. This is assisted self-development; failed and
pre-fix records remain intact. The supervisor and external checks remained outside
the candidate's writable scope throughout.
