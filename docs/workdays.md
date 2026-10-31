# Two-owner workdays

Phase two introduces a deterministic workday: one requester, one authorized recipient,
one shared candidate worktree and sequential Luna execution. This page specifies the
incremental interface; `run` and routed handoffs are delivered after the foundation.

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

The next increment routes one dependency request, permits at most two clarification
rounds, and parks/restores unfinished requester changes. Acceptance is distinct from
verified delivery. Each assignment retains 900 seconds of cumulative active execution;
the workday has a 2,400-second wall-clock deadline. Cancellation/interruption retains
partial evidence and stops dispatch. No resume command or background activation exists.
