# Phase one implementation sequence

Accepted objective: one real steward, application-managed environment/worktree,
then self-development under human architectural direction.

1. Issue #7: built prepare/cleanup CLI, real worktree/environment lifecycle,
   retained evidence, subprocess cancellation, guarded cleanup, deterministic CI.
2. Component/ancestor context, TypeScript Codex SDK, captured baseline and final
   verification, actual change/scope checks, structured result and reports.
3. Two real sample executions implementing `isSessionExpired(expiresAtMs, nowMs)`
   with the `nowMs >= expiresAtMs` boundary, independently checked.
4. A stable ArcNexus runner supervises its own report improvement: sorted changed
   paths and kinds in Markdown. Review/integrate through normal repository workflow.

Each slice documents behavior, adds failing built-program acceptance, implements,
verifies, and integrates to staging before the next. Caller owns commits/PRs.
One execution, Linux/POSIX, local host tools, explicit commands, no containers,
runtime installation, database, UI, concurrency, or automatic resume.
Live-model evidence is separate from deterministic CI; completion requires both
sample runs and the real self-change, not merely mocks or a successful build.

## Delivered evidence

Workspace lifecycle shipped through PR #8, single-steward execution through PR #10,
and two independently verified coding runs through PR #12. The report improvement
in issue #13 was implemented through ArcNexus itself; see
[the self-development record](../acceptance/self-development.md).
No UI, coordination database, inbox or multi-steward system was needed to reach
this first self-development loop.
