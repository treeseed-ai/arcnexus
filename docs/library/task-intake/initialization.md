# Initialization and task proposals

Issue #65 defines the following contract; delivery is complete only after the
built-program acceptance and live qualification gates pass.

Every steward run and workday initializes once before participant inference.
Experiment cases use the same entry points, without adding another initializer.
The platform's version-3 definition names one initializer component. ArcNexus uses
`task-intake`; older projects receive an explicitly reported runtime-supplied,
read-only intake component. Initialization is a lifecycle prerequisite, not priority.
The host calls it directly without recursively starting another assignment.

The initializer receives captured repository/revision, catalog, request, caller
constraints and any explicit assignment/workday envelope. It uses Luna/medium by
default. `--initializer-model` selects its model independently of worker selection.
It runs source-read-only and cannot change permissions, checks or participants.
Its result is `ready`, `needs_clarification`, or `architecture_change_required`.
Prompts, result, thread, supplied context, owner reasoning, usage and elapsed time
are retained outside the candidate. Agent reasoning summaries are not private reasoning.

## Commands

```sh
arcnexus task plan --input request.txt --project /repository \
  [--base revision] [--bindings bindings.yaml] \
  [--initializer-model model] [--codex-path executable]
arcnexus task inspect <proposal-id> [--json]
arcnexus task run <proposal-id>
```

Planning retains an immutable proposal and initialization evidence. It creates an
application-owned workspace for read-only inspection, preserving the source checkout.
Running explicitly accepts a ready proposal, validates its captured inputs and starts
fresh candidate work. It reuses the unchanged initialization result, not a second
initializer turn. Changed source revision, configuration, bindings, checks or supervising
build require a new plan. A non-ready proposal cannot execute.

Owner selection first retrieves lexical matches from identities, purposes, interfaces,
owned paths and declared relationships. The initializer assesses those candidates and
explains selections, rejections and uncertainty. The host validates proposed owners,
permissions, checks and dependency direction. It supports one owner or the existing
sequential two-owner workday. A dependency points from the requesting consumer to
the supplying owner, not in delivery order. Intake receives eligible directed edges
from captured related-owner declarations and must select that direction. Necessary larger teams require architectural decomposition;
they are never silently truncated. Retrieval is not an embedding service or database.

Existing explicit assignments may be confirmed or questioned, never silently broadened.
Task proposals use captured component verification; a model cannot invent trusted host
commands. Caller-supplied independent acceptance remains outside candidate authority.

## Architectural changes

`architecture-maintenance` owns catalog content. Intake identifies missing/conflicting
responsibilities and proposes definitions, directories, relationships, roles, operations,
verification, affected owners, migration implications and acceptance criteria. Proposals
remain evidence until the caller accepts and integrates a catalog change through the
normal repository workflow. A fresh plan against that revision establishes new authority.
Unknown-owner inbox requests still escalate; they cannot dynamically admit another owner.

`prepare`, `validate`, `inspect`, status/follow and cleanup do not invoke inference.
There is no automatic recovery or resumption after interruption.

For task-generated change assignments, the caller's optional binding file can declare
`taskAcceptance`, mapping owner IDs (and `combined` for two-owner work) to trusted
host-check definitions using the existing check contract. These checks are captured
before inference and never supplied by the model. Without independent change
acceptance, intake retains a clarification proposal rather than activating a worker.
`taskRefresh` maps owner IDs to fixed refresh commands for two-owner candidate views.
These commands are also caller-controlled captured input, not model-generated tools.

## Initial limit policy

Optional execution deadlines and quotas remain unset. Where a protocol requires
an explicit timeout, use a generous 24-hour ceiling initially, with cancellation
and parent-liveness supervision still active. A one-second pending-operation
observation window returns progress; it does not terminate the operation.

Test-process watchdogs use 30 minutes and the CI job allows six hours so machine
contention does not masquerade as a runtime failure. Tests that deliberately
exercise caller-configured limits retain their explicit short limits. These
harness ceilings are not application execution defaults. Revisit required ceilings
using recorded execution evidence rather than speculative short deadlines.

Independent verification uses the separate `verification-result` contract. The
host supplies indexed captured acceptance criteria. Each index must appear exactly
once with a verified verdict, nonempty evidence and an explanation before delivery
can be promoted. Missing, duplicate, unknown or gap entries and unresolved
deficiencies prevent completion. Workers cannot supply this assessment themselves.
Task goal assessment includes the original external goal and the retained assignment
criteria; verified owner deliveries alone do not establish whole-goal completion.
Historical ordinary agent-result review records remain inspectable.

A later prompt may include a retained task UUID to refer to its question, goal,
assignment outcomes and verified evidence. The director receives that retained
context explicitly. The invocation still creates a new task and uses current
captured authority; referencing prior work neither resumes uncertain operations nor
imports unfinished candidate edits. The referenced task keeps its original outcome.

Independent verification receives host-captured change evidence in addition to
command outcomes and worker claims. The manifest identifies every tracked or
unignored changed path; retained tracked patches and untracked file contents are
available through a fixed read-only evidence operation. The operation reads only
artifacts captured for that assessment, supports explicit paging, and reports full
length and hashes so partial output cannot masquerade as the complete evidence.
Owner assessment compares against its assignment candidate base. Whole-goal
assessment compares the assembled candidate against captured source authority.
The candidate digest is pinned before capture and checked after assessment.
Unavailable native Git metadata does not require broader verifier filesystem access.
