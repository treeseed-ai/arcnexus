# Pre-phase-two single-steward qualification

The architecture contract, observable workflow, composed workspaces and explicit
qualification runner are integrated through ArcNexus PRs #33–#36. TreeSeed's real
catalog is integrated through Platform #869; the retired Studio/language and
intent/implementation blueprints were removed separately through #868.

The [structured evidence index](pre-phase-two.json) records revisions, run IDs,
report hashes, elapsed time, supplied prompt sizes and available SDK usage. Full
campaign manifests, captured acceptance artifacts, reports, raw events and logs
remain outside candidates under `~/.local/state/arcnexus/campaigns/` and `runs/`.
The supervising build is retained at `supervisors/91b2b439` in that state directory.

## First campaign: preserved failures and verified ArcNexus cases

Campaign `20261031-single-steward-1` used Luna/medium exclusively, once per case.
Its overall result is **failed**, not reclassified after later fixes. The runner
hash is unchanged. ArcNexus base is `91b2b439526bcc4fa4a5d7dd9e73035d832144bb`;
TreeSeed base is `4718e56e2b310b0a08a2da52de2e08796e75a240`.

| Case | Result | Evidence |
| --- | --- | --- |
| ArcNexus report improvement | Passed; 3 turns, 1 implementation attempt, 478.911 seconds | `b53b8418-c6dc-4df5-b941-ad7f504c0744`; integrated in [PR #37](https://github.com/treeseed-ai/arcnexus/pull/37) without caller implementation fixes |
| TreeSeed diagnostics | Failed before inference | `7427b631-9d5e-4c69-80f7-c4d9f71fc4fb`; declared cache outputs were discovered as third-party tests |
| Deliberate corrective repair | Passed; 4 turns, 2 implementation attempts, 601.408 seconds | `106038cc-97ef-4295-8c51-55c4bc8d6fd8`; injected outcome substitution failed the unchanged independent check, Luna edited real code, then that check passed |
| TreeSeed boundary request | Failed before inference | `330ffeb7-b000-4d75-8617-cb4f86de2dba`; same setup defect, no owner-escalation claim |
| ArcNexus research | Passed read-only; 1 turn, 114.487 seconds | `a04463d8-8ea4-4ec9-8d86-f68f7920cc98`; correctly distinguished architecture-owned resolution from assignment-owned execution, citing definitions and code |
| TreeSeed review | Failed before inference | `4790a361-b050-4244-82bd-c8f79be6af69`; same setup defect, no review claim |

The report change passed expected-red, normal verification, frozen regression,
independent acceptance and read-only review checkpoints. A separate built-CLI report
smoke failed against the original supervisor and passed against the candidate.
Caller work was changelog/Git integration bookkeeping, not a feature-code repair.
The candidate workspace and execution evidence remain retained after branch cleanup.

The corrective receipt records source digests `065fef5f…` before injection,
`95e85f29…` after deliberate injection, and `065fef5f…` after Luna's repair.
This demonstrates actual corrective editing, not spontaneous defect discovery.

The research result follows declared ownership despite misleading module names:
`architecture` owns `resolveAssignment` in `src/assignment.ts`; `assignment` owns
`runSteward` in `src/steward.ts`; `workspace` owns lifecycle implementation. This
supersedes the earlier probe's filename-based ownership inference, without hiding it.

## Lessons and remaining gate

The host must remain authoritative for verification: narrower steward permissions
can prevent running some integration checks or reading an interpreter symlink,
while the host can run the complete captured suite. The steward recorded those
limitations; host checks independently passed. Supplied prompt bytes measure only
ArcNexus's prompt contribution, not the effective Codex context. Raw cumulative SDK
usage and derived turn deltas are retained; counters are not a pricing estimate.

TreeSeed's failure exposed divergent CI setup. [Platform #871](https://github.com/treeseed-ai/platform/issues/871)
moves caches into excluded dependency storage, prepares archive-path permissions
required by the existing public inspector, and runs the declared setup plus full
baseline in CI. The checker itself is not weakened. A fresh application-created
workspace at that fix passes the real baseline without inference.

The campaign summary also mislabeled pre-inference errors as missing Luna settings.
The execution record preserved the real error; a regression now requires the summary
to expose it before checking model settings.

Phase two remains gated on a successful follow-up TreeSeed change, precise SDK-owner
escalation, useful read-only review, and normal integration CI/review. Successful
ArcNexus cases need not be repeated merely because another target failed before
inference. Follow-up manifests must name their new pinned revision and retain this
failed campaign separately; no automatic campaign retry is permitted.

## First TreeSeed follow-up: boundary proven, context gaps exposed

Campaign `20261031-tree-followup-1` pins Platform `9208ef5` after setup fix
[PR #872](https://github.com/treeseed-ai/platform/pull/872). It is retained as failed.
The diagnostics case `e317209b-f7ac-4f4f-a149-efe2e5347d9c` stopped after documentation
and tests, before implementation: the steward's login shell could not find Bun.
The host baseline had passed. A sandbox probe additionally established that the
external bound binary needs its containing directory made explicitly read-only.

Boundary run `6f287f58-de87-4d93-9fe9-6e8dbc9a17a7` passed: Luna inspected actual SDK
source and installed public declarations, found no ArtifactChange export, and
requested the versioned shape, public export, consistent built declarations and
owner verification from `sdk-contracts`. Platform source and dependencies remained
unchanged. The caller reviewed the evidence and ownership; this case needs no rerun.

Review run `56d950d0-484d-4398-8f2c-9190f0aa69a3` produced useful source findings but
could not attribute the pinned change because external Git metadata was hidden.
Its request also used the parent instead of the active component as requester;
the host correctly rejected that malformed boundary claim. It is not a passed review.
[ArcNexus #38](https://github.com/treeseed-ai/arcnexus/issues/38) supplies resolved
tool commands/environment, read-only tool directories and host-captured review diffs
with provenance, retaining the sandbox and exact write checks.

## Context follow-up: review proven, sandbox check delegated

Campaign `20261031-tree-context-1` uses immutable supervisor `59fc6d8`, retaining the
same Platform revision and assignment acceptance. Review run
`a2290fe7-6ab0-456c-8608-73f7aec970bc` passed without edits: it inspected the supplied
first-parent diff, pinned public Deployment implementation, setup commands and actual
verification coverage. It correctly separated existing archive inspection from the
future sorted/classified behavior and stated what the host must verify.

Change run `e5e78cd3-4859-4424-b3ab-05cbfdadaf8b` reached Bun but stopped before
implementation when a nested sandbox process received EPERM writing stdout. This
failed campaign is retained. The host can execute the real archive checks; #38 now
explicitly lets a specification turn propose its expected assertion while reporting
the sandbox limitation. The host still must observe the exact expected red failure
before allowing implementation. This is not a waived verification or a caller
feature-code fix. Successful boundary/research/review cases are not repeatedly run.

Campaign `20261031-tree-host-1` at supervisor `882b7fd` also remains failed. In run
`006efd07-955d-4377-aff5-cbe8e64cdfbe`, Luna prepared tests and returned a completed
specification, but nominated the sandbox EPERM as its expected failure. The host
instead observed the genuine missing-kind assertion and rejected the mismatch.
Inspection also found the proposed test selected the API baseline rather than the
requested admin baseline. No implementation occurred. The subsequent caller input
makes the existing archive selection and behavioral assertion marker explicit;
this assignment clarification is recorded as intervention, not hidden as a passing
first attempt or a caller implementation fix. The host checkpoint is unchanged.

The explicit-checkpoint campaign `20261031-tree-explicit-1` also failed safely:
`d21e041b-2def-49bf-a2d0-15e87f3a680e` used the correct archive pair and marker, but
put an unmarked ordering assertion before the marked kind assertion. The host
rejected the mismatch. A second caller specification clarification requires the
marked kind assertion to be the first behavioral assertion; no candidate test or
implementation was edited by the caller. This documents a real Luna limitation:
unobserved red-check prediction needs precise sequencing when sandbox-local tests
are unavailable. The gate is not weakened to any nonzero status.

Related [upstream stdio report](https://github.com/openai/codex/issues/57231) describes
similar restricted-sandbox subprocess failures. It is corroborating research, not
proof of the same cause or a verified fix for our installed CLI. No sandbox policy
was disabled to work around it.

## Qualified TreeSeed implementation

Campaign `20261031-tree-ordered-1` passed using immutable supervisor `882b7fd` and
Platform base `9208ef5`. Run `5fd1c042-9ac0-461c-b7c4-d3efc471408c` took 136.854 seconds,
three turns and one implementation attempt. The host observed the expected named
missing-kind assertion, then passed normal verification, frozen regressions,
independent acceptance and final checks after read-only review. The independent
check verifies 32 real archive changes: 20 added, 9 removed and 3 modified, retaining
metadata/digests and rejecting invalid selection. No caller implementation/test
fixes were applied to the candidate. Two specification clarifications are recorded.
The candidate is under normal integration review in
[Platform #873](https://github.com/treeseed-ai/platform/pull/873); CI is still pending.

The final runtime refinement is integrated in
[ArcNexus #39](https://github.com/treeseed-ai/arcnexus/pull/39), with 111 deterministic
Node tests, six Python tests and CI green. The evidence follow-up also makes every
source module's executable ownership observable through built `inspect` commands.
