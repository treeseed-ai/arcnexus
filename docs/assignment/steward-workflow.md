# Observable single-steward workflow

Increment two (#31) implements this contract. One Luna thread performs bounded
work. Activities are research, documentation, testing, implementation, review and
release/handoff; they are not separate agents. The host records transitions in
`activities.jsonl` and per-turn evidence in `turns/<number>/` outside the candidate.

## Assignment planning

Version-2 execution profiles first run a source-read-only planning turn. The host
validates and retains the plan and checklist; `plan.update` records progress or a
reasoned revision during execution. Final `planUpdates` are also accepted. Agent
completion claims remain separate from mandatory host acceptance. See
[operations and evidence](../operations/steward-operations.md). Version-1 profiles retain the
original workflow below.

## Change assignments

1. **Specification:** research as needed, document intent and create a failing
   regression. Only declared documentation/test paths may change. The result
   selects a captured verification command by index, a nonzero expected exit code,
   and a literal expected assertion/test diagnostic. The host checks that failure
   and captures all changed regression files and hashes before implementation.
2. **Implementation:** edit within the assignment scope. The host executes project
   verification, the frozen regression against candidate implementation, and caller
   acceptance checks. Tests edited later cannot replace the frozen regression.
3. **Review/handoff:** source-read-only review of the candidate and evidence.
   Completion requires final identity, scope and verification checks. Release is
   `ready_for_integration`, not a commit, approval, merge or publication.

`changeType: "documentation"` in a structured assignment skips the red-test check;
only declared documentation paths may change and project verification still runs.
All other changes default to `changeType: "behavior"`. Missing documentation or
regression scope is a preflight error for behavior work.

Version 1: one implementation attempt and at most three turns. Version 2 adds
one planning turn, giving four normal or six corrective turns. `--max-attempts 2`
allows one corrective implementation turn plus review, at most five total turns.
Specification failures stop; scope/identity violations, invalid output, cancellation
and timeout never authorize correction. A failed host check or actionable review
can use the remaining corrective attempt. All turns share the original timeout.

The regression check is selected from the immutable component command list. The
agent cannot introduce arbitrary host commands. An expected diagnostic is evidence
of a red test, not proof that the test adequately specifies the objective; caller
acceptance and review remain separate requirements. Frozen files are temporarily
restored for host regression checking, then candidate versions are restored in a
finally block. A hard interruption retains an incomplete record for inspection.

## Research, review and boundaries

`--kind research` and `--kind review` each use one source-read-only execution turn (plus planning for version 2) and may
complete without changes. Findings include evidence references, uncertainty and
consequences. No-change is still a failed outcome for change assignments.

Structured results contain status, summary, blockers, findings, activity outcomes,
regression checkpoint (or null), review findings, and boundary requests. A request
names the requesting component, required owner (or null for unknown ownership),
requested decision/interface, evidence, acceptance conditions and why current
scope cannot satisfy it. Known owner IDs must resolve in the captured catalog.
Unknown owners become architectural questions. Requests are returned to the caller;
no messaging or second agent is activated.

The report distinguishes `ready_for_integration`, `research_completed`,
`review_completed`, `blocked`, `failed`, and `no_changes`. Its lifecycle status stays
compatible with existing records. Logs retain every turn's prompt, SDK stream,
settings, result, actual diff and checks. The append-only activity journal records
started/completed/skipped/blocked/failed transitions, including host checkpoints.

Usage records preserve raw thread-cumulative counters and per-turn deltas, mark
missing/decreasing counters incomplete, and do not double count resumed turns.
Prompt bytes/hash measure ArcNexus's input, not all Codex context. Reports record
caller interventions explicitly; a zero count means no intervention was supplied
through this execution, not that no prior human planning occurred.

## Read-only revision evidence

Review turns receive a host-captured diff as untrusted evidence, with its SHA-256
and provenance retained in the turn record. A review assignment receives the pinned
base revision against its first parent (or the empty tree for a root commit), limited
to declared readable paths. The implementation-review turn receives the current
candidate diff and new-file contents. The steward does not need access to the source
repository's Git metadata; permissions remain unchanged. A review request must name
the active component as requester even when the needed decision belongs to a parent.

A sandbox-local inability to run a regression is not proof that the regression
failed correctly. The specification turn may return a completed preparation with a
proposed failing assertion/exit expectation and an evidence-backed limitation. The
host then runs the captured command and must observe that exact failure before
implementation. The steward must not claim verification it could not perform;
missing or mismatched host evidence still stops the workflow.
