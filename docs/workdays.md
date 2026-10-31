# Two-owner workdays

Phase two introduces a deterministic workday: one requester, one authorized recipient,
one shared candidate worktree and sequential Luna execution. The runtime captures authority and verifies each handoff before dispatch.

## Captured definition

A version-1 workday manifest has `requester` and `recipient` participants, each with
`component`, an assignment-file path, optional `maxAttempts` (1 or 2, default 1), and
`refresh` commands. It has one `dependency` containing `from`, `to`, `contract`, and
`delivery` (a concrete condition within the recipient assignment), plus `acceptance`
host commands for the assembled candidate. Assignment and artifact paths resolve
relative to their defining file. Commands use executable/argument arrays, never shell
strings. The recipient assignment is its authorized envelope; a request supplies
context within that envelope, never replacement authority or acceptance.

Both owners must belong to the primary repository and have disjoint effective writable
paths. Existing read-only members remain supported. Definitions, checks, prior evidence,
base revision and bindings are captured before preparation. The workday cannot change
an active assignment by editing a candidate definition or instruction.

```text
arcnexus workday inspect <manifest> --project <repository> [--base <ref>] [--bindings <file>] [--json]
arcnexus workday status <workday-id> [--json]
arcnexus workday follow <workday-id> [--json] [--after <sequence>]
```

Inspection performs no setup, state creation or inference. Status/follow read retained
SQLite state. Follow displays ordered events after the exclusive sequence cursor, then
waits until terminal state; interrupting the viewer does not cancel execution. Missing,
unsupported or inconsistent state is an error, not an empty completed workday.

## Persistence and checkpoints

The private per-workday database has workdays, assignments, messages, executions and
events tables. Coordination state and its events commit together. Immutable message
identities prevent duplicate delivery. Reports are projections; raw SDK events and
execution artifacts remain in their existing locations. Historical reports are not
migrated. SQLite uses Node's built-in API (experimental on Node 22); Node >=22.13 <23
is required. No external database or native dependency is installed.

A steward session records checked turn boundaries, retained thread, plan, frozen
regression evidence, attempt/operation counters, consumed active time, authority hashes
and candidate evidence. Standalone execution uses the same session engine. A checkpoint
is inspection evidence, not authorization to recover a process or reset a budget.

The runtime routes one dependency request, permits at most two clarification
rounds, and parks/restores unfinished requester changes. Acceptance is distinct from
verified delivery. Each assignment retains 900 seconds of cumulative active execution;
the workday has a 2,400-second wall-clock deadline. Cancellation/interruption retains
partial evidence and stops dispatch. No resume command or background activation exists.

## Routed execution

```text
arcnexus workday run <manifest> --project <repository> [--base <ref>] [--bindings <file>] [--issue <number>] [--codex-path <executable>]
```

Run creates one candidate and two assignment records. Both baselines pass before the
first model turn. The workday holds the global lock until completion. Exit codes are
0 verified completion, 1 blocked/failed/exhausted, 2 invalid input/preflight, and 130
cancellation. Both assignments must complete and combined acceptance must pass.

Workday structured results add nullable `coordination`: action (`request`, `accept`,
`reject`, `clarify`, `answer`), contract identity, correlated request ID (null for a
new request), text, and `activityComplete`. A request also carries the existing precise
boundary-request fields. The host supplies message and assignment identities. Messages
are bounded to 16 KiB. A request may not replace the captured recipient objective or
checks. Accept commits intent only; delivery is created by the host after verification.

The recipient decides during its read-only planning turn. Clarification and replies
are read-only and cannot activate a third owner. One dependency and two clarification
rounds are permitted. The six workday coordination/continuation turns are additional
to existing engineering turns; every turn is counted once. Attempts, operation calls,
plans and frozen tests persist. Incomplete activities continue in the same thread and
attempt; a completed specification still passes the expected-red gate. A review that
yields must inspect the assembled candidate again when it resumes.

At suspension the host saves exact working bytes, executable modes, staged blobs and
deletions, then parks only the requester's paths. A durable intent precedes filesystem
mutation. Restoration verifies those paths still match the parked baseline and cannot
overwrite recipient changes. Other-owner edits are checked against captured snapshots,
not simply excluded from scope checks. Declared refresh commands must preserve source.

Each assignment's active clock includes its commands and turns but pauses while the
other owner executes. The workday deadline never pauses. All managed resources stop
at a handoff. Cancellation stops dispatch and attempts safe restoration; ambiguous or
interrupted transitions remain unresolved and prevent cleanup. There is no restart or
resume command. The caller owns integration of the final combined diff.

Workday reports distinguish each owner's attributed changes from the full candidate
diff captured in its execution artifacts. Active, waiting, command and coordination
times have explicit accounting bases; they are not estimates of private reasoning.
A hard interruption leaves durable state incomplete. Viewers identify a departed host,
and cleanup refuses active or unresolved workday transitions pending manual inspection.

## Qualification

The contract fixture and real guidance/validator assignments are declarative experiments.
Qualification uses a stable external supervising build and pinned pre-improvement base.
The guidance owner's documentation scope includes selected instruction/skill files;
validator checks rebuild the CLI before testing, and requester refresh rebuilds after
owner delivery. Source ownership remains disjoint. Failed live invocations are retained
separately; a later invocation is explicit. Simulation never establishes the live gate.

An incomplete planning turn may retain a proposed plan and progress claims, but those
claims do not update an accepted checklist. After delivery, planning continues and
must produce a valid initial plan. Checklist activities use the role's engineering
activity names; `specification` is a host stage, not a separate role activity.

The model-facing coordination schema is narrowed by host state on every turn. A
requester may request only before its dependency exists; a recipient may accept,
reject or clarify only while its planning decision is pending. A clarification reply
may answer. Other turns require `coordination: null`; observations belong in findings
and activities. Host validation independently rejects unavailable actions even when a
controlled executable ignores the supplied output schema.

Readable reports include unrouted owner requests as agent claims when host authorization
rejects the destination. Their requested owner, evidence and acceptance conditions remain
visible even though no inbox delivery occurred. An unrouted request is never presented
as accepted work or as a reason to activate an additional steward.
