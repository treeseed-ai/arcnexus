# Execute agents

Run commands from the target repository or a directory within its selected package:

```sh
arcnexus workday start
arcnexus workday pause
arcnexus workday resume
arcnexus workday stop
arcnexus workday status
arcnexus task run "<prompt>"
```

Workday controls take no arguments or options. Task execution takes exactly one
prompt. The runtime discovers the canonical Git repository and deepest containing
package. Equally applicable packages require a declared default; ambiguity is an
input error. Linked worktrees share project execution ownership.

## Captured project configuration

Commit component definitions, their containing package, role/profile declarations,
environment setup and trusted verification commands. Declare
`architecture/execution.yaml` with `directorProfile`, `reviewerProfile`, an optional
`defaultPackage`, and any additional `verificationInputs`. The
[general fixture](../../../fixtures/general/README.md) supplies a complete example.
Models belong to profiles, rather than scheduling code. ArcNexus uses Luna engineering
and Astra director/reviewer profiles.

Local executable bindings are discovered at `arcnexus/bindings.yaml` inside the Git
common directory (`.git/arcnexus/bindings.yaml` in an ordinary checkout). Bindings are
machine configuration, outside committed source authority; their identity is retained
in execution evidence. Reuse existing Codex authentication. No manifest, proposal ID,
model flag or executable flag is needed for normal execution.

New runs require a clean source checkout. Captured architecture and acceptance remain
stable throughout the run. New owners and expanded authority require architectural
decisions. Candidate edits cannot grant themselves permissions or weaken active checks.
See [filesystem access](../../library/architecture/component-access.md) and
[workspace preparation](../../library/workspace/workspaces.md).

## Workday and task behavior

Workdays use component purposes, objectives, questions, relevant history and inboxes.
A complete unchanged pass becomes idle. Relevant inbox, candidate or dependency
changes wake affected stewards; `resume` on an idle workday requests another pass.
There is one accountable owner per assignment and no fixed owner count. Container
context is inherited without manufacturing assignments for containers.

Tasks use a director to interpret the goal and choose starting owners. Workers can
request other eligible owners themselves. Dependencies resume at the required accepted
or verified-delivery milestone; acknowledgment alone cannot establish delivery. Tasks
queue FIFO and suppress self-directed activations while they own project execution.

A task safely pauses an active workday, uses the latest verified candidate, then
returns control unless the user explicitly paused/stopped the workday or integrity
requires attention. A manually paused workday stays paused. Terminal clarification
is interactive; without a terminal, questions remain in a `needs_input` outcome.
SIGINT cancels the attached task and preserves its evidence.

`start` is idempotent and does not resume a paused workday. `pause` returns `pausing`
while real work reaches a safe checkpoint; it has no hidden deadline. `stop` cancels
promptly and preserves candidate changes. A stopped workday cannot resume. A new
workday may reuse compatible verified deliveries without silently restarting old
partial assignments. `status` reports lifecycle, active work, queues, inboxes,
blockers, verified progress and candidate location.

## Verification, continuation and evidence

The runtime retains plans, threads, regression evidence, dependencies and pending
operations across activations. Research, review, documentation, behavioral changes
and behavior-preserving refactors use their applicable workflows. Behavioral work
requires actual specification changes and observed expected-failing regression
before implementation. Captured host checks and independent read-only verification
must support acceptance; task completion also requires goal-level assessment.

Each assignment has an isolated workspace. Verified deliveries accumulate through
checked reconciliation. Conflicts retain both versions and block promotion. Reports
separate worker claims, observed host checks and independent assessments. Worker
completion alone is not verified delivery, and delivery alone is not task completion.

Evidence includes structured reports, ordered events, raw harness observations,
command logs, retained diffs and candidate references. Staged, unstaged and untracked
changes are inspected separately; restoring a working file cannot hide a staged edit.
The host does not stage, integrate or publish a candidate on the caller's behalf.

Host loss stops managed subprocesses and retains interrupted work. Recovery validates
checkpoints and never automatically replays an operation whose completion is uncertain.
A missing model thread may be replaced with a recorded continuation from captured
context after validation. See the [general execution contract](../../library/execution-runtime/execution.md)
and [qualification record](../../plans/general-agent-execution-qualification.md) for
current evidence and remaining limitations.

Exit codes are `0` for verified completion/control success, `1` for blocked or
unsuccessful execution, `2` for invalid input/preflight, and `130` for cancellation.
General execution rejects obsolete time/turn/call/attempt budgets. Cancellation,
transport safeguards, progress detection and test watchdogs remain active.

Legacy explicit execution commands remain migration adapters for historical scenarios.
Use the normal commands above for new work. Validation, test selection and retained
report inspection remain supported; historical reports do not gain new authority.
