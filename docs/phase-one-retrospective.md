# Phase one retrospective and coordination readiness

Phase one established the intended loop: human architectural direction → managed
workspace → steward work → independent verification → review and integration.
ArcNexus implemented both its report improvement and a corrective cleanup change.
The [whole journey](dev.md) remains a sequence of usable increments, not a reason
to delay use until a complete platform exists.

## Model and session behavior today

The shipped CLI defaults to `gpt-6-astra`; `--model` overrides it. The architect's
updated direction is to use **`gpt-6-luna` for live tests and Luna-sized models as
the intended steward baseline**. Invoke subsequent tests with `--model gpt-6-luna`.
The earlier Astra results below remain valid historical evidence, but do not prove
small-model readiness. This documentation change does not change the CLI default.

The [adapter](../src/codex.ts) uses medium reasoning, workspace-write, approval
never, no agent network/web search, and a launcher inserting `--ignore-user-config`.
It reuses existing Codex authentication. Host environment setup and host verification
are separate from the agent's sandbox; setup may install declared dependencies.
The SDK is pinned to 0.166.0. These are application settings, not identification
of the model serving a developer's Codex desktop conversation.

Each `run` creates a fresh worktree and a new SDK thread, then calls `runStreamed`
once. That turn may contain many tool/model steps. The runtime stores the thread ID,
events, usage, settings and verification evidence. It does not resume the thread,
send a second turn, share conversations between assignments, or maintain a persistent
steward conversation. SDK thread storage is not an application recovery protocol.

One lock in the application state directory permits one active execution. State
normally lives in `~/.local/state/arcnexus` (overridable through `XDG_STATE_HOME` or
`ARCNEXUS_STATE_DIR`), with separate `runs/<id>` and `workspaces/<id>` directories.
A run has a 900-second default overall budget; each managed setup/verification
command is bounded to 120 seconds within that budget. Cancellation stops managed
processes and retains evidence. A hard interruption leaves an incomplete record;
there is no automatic retry, stale-lock recovery, or resume. Cleanup preserves
reports and branches; it does not promise to erase Codex's own session storage.

## What actual use taught us

| Observation | Consequence and smallest useful response |
| --- | --- |
| Two fresh identity-library runs installed dependencies and passed an external expiration-boundary check. | Keep testing the assembled application and real SDK boundary. Deterministic CI and live-model checks answer different questions. The same sample subsequently passed twice on Luna; this does not establish coordination reliability. |
| The first self-report candidate was correct but reported blocked when nested CLI tests hit sandbox `EPERM`; a fresh run with explicit verification handoff succeeded. | Clarify artifact readiness versus sandbox verification availability in shared guidance, while retaining mandatory host verification. [Issue #14](https://github.com/treeseed-ai/arcnexus/issues/14) tracks the observed gap. Do not reinterpret every blocked response as success. |
| Host `python3 -m venv .venv` failed because ensurepip was absent. Installed uv supplied the declared local environment without installing a runtime. | Keep prerequisites explicit and failures inspectable. Do not infer that a runtime's presence guarantees every environment facility. See the [configuration and evidence](acceptance/live-sample.md). |
| Cleanup originally overwrote execution status and timing, despite a green suite. | Preserve execution evidence independently of workspace lifecycle. A byte-for-byte before/after acceptance check caught it; ArcNexus implemented the fix itself. See [self-development](acceptance/self-development.md). |
| Stable external supervisors and acceptance checks verified both self-changes. | Retain this boundary for coordination: candidate edits cannot redefine the current objective, permission, supervisor or acceptance criteria. |
| Useful self-development happened with no UI, inbox or database. | Build only the next complete contract handoff. Do not make a full platform, agent framework or parallel execution a prerequisite. |

Phase-one completion evidence included 39 product tests, six Python tests,
TypeScript checking, ten skill validations, assembled-CLI smoke checks and CI.
Those counts describe that revision; they are not evidence that future changes pass.
Details and retained run identities are in the [sample](acceptance/live-sample.md)
and [self-development](acceptance/self-development.md) records.

### Usage should inform the next experiment

These recorded turns illustrate why small-model tests and bounded work matter.
The first four used Astra; the final two used Luna:

| Run | Elapsed seconds | Input tokens | Cached input tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: |
| Identity `73ea97a8…` | 35.4 | 121,615 | 104,064 | 1,018 |
| Identity `f19dcde8…` | 31.9 | 97,207 | 81,536 | 1,013 |
| Self-report `c31724be…` | 113.9 | 257,088 | 224,896 | 3,424 |
| Self-cleanup `43ad1f7a…` | 104.0 | 284,122 | 247,680 | 2,922 |
| Luna identity `89a49ca1…` | 19.1 | 104,227 | 75,392 | 1,036 |
| Luna identity `0b9c1446…` | 18.7 | 104,918 | 89,216 | 1,050 |

These are SDK-reported aggregate turn token counts and application elapsed times,
not initial prompt sizes or dollar/quota estimates. Cached input is a subset of
input, not additional usage. They do not by themselves identify which context
caused the usage. Two sample runs are not a general performance benchmark. Compare verified
completion, blocked runs, retries and aggregate
usage under Luna; do not optimize for the number of messages or lines generated.
No large-model fallback should occur silently after a Luna failure.

## Before the first two-steward slice

1. **Close the demonstrated readiness ambiguity.** Implement issue #14 with an
   observable acceptance case: disclosed sandbox inability does not replace or
   bypass the mandatory host check, and a genuine blocker still blocks. This is
   a focused improvement suited to the existing self-development loop.
2. **Write down the lifetimes and authoritative state.** A component's steward is
   a lasting responsibility; an assignment is owned work; an execution is one
   attempt; a Codex thread is harness conversation state; a worktree is a candidate
   revision. They must not share one implicit notion of "session". Persist the
   assignment's dependency and outcome in ArcNexus, not only in model conversation.
3. **Decide how the requester sees the provider's implementation.** Current runs
   always start fresh worktrees. A successful provider run therefore does not make
   its code automatically visible to a requester. Choose a small, explicit rule
   for the first slice: sequential scoped ownership in one workday workspace, or
   separate candidates with an explicit integration step. Define the revision used
   by resumed work and test it. Do not accidentally build cross-repository merging.
4. **Extend the model baseline.** Two Luna sample runs now pass. Use Luna for self-development and coordination acceptance objectives,
   with unchanged independent checks. A two-agent success needs both contributions
   and the original objective verified. Failures should identify missing context,
   unclear state or insufficient capability before anyone proposes a larger model.

Items 2 and 3 are phase-two design decisions, not authorization to implement a
large session system now. A fresh thread per activation plus explicit persisted
context is a simple initial candidate. Thread reuse can be evaluated when it solves
an observed continuity problem; if used, revalidate scope, revision and instructions.
A thread ID must never become authorization or the only record of unfinished work.

## Build these into the first coordination acceptance

Use two real components, one contract-dependent objective, one accountable original
owner, and one provider-owned child assignment. Keep execution sequential. Persist
validated requests and state transitions before dispatch so interruption cannot
silently lose a handoff or execute it twice. Use stable request/assignment identifiers
and explicit bounded transitions at these seams; no generic workflow engine is needed.

Distinguish **contract accepted**, **implementation ready**, and **release available**.
Resume the requester only at the milestone its dependency requires. Waiting is a
recorded state; it must not cause repeated paid model calls asking whether work is
finished. Bound total executions, exchanges and elapsed time; report exhaustion.

The first vertical slice should verify the requester-to-provider-to-requester path,
then rejection, malformed/duplicate handoffs, interruption around persistence, scope
violations and unavailable implementation. Check the final integrated behavior
outside both agents' writable acceptance scope. Keep default production wiring in
built-program tests, with deterministic executable scenarios in CI and separate
Luna live evidence. Narrow context to the full applicable ancestry, assignment,
relevant contract and necessary handoff evidence; avoid replaying every agent log.

Defer parallel execution, distributed workers, model routers, vector memory, UI,
automatic recovery and multi-project release machinery until a demonstrated slice
requires them. Resolve the workspace decision and implement one working handoff;
do not turn this retrospective into another long prerequisite program.
