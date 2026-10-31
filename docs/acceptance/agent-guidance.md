# Agent guidance acceptance

Issue #51 adds the TypeScript metadata checker and real agent-guidance ownership.
The [evidence index](../guidance-qualification.json) points to retained private
artifacts beneath the ArcNexus state directory.

Luna run `53f94231-dc28-419d-9d23-4d5a00037015` used the captured hierarchy
`arcnexus → cli-package → agent-guidance`, its specialized role, related validator
owner, and declared guidance-validation operation. Four turns in one thread
completed in 72.6 seconds, with one implementation attempt and no caller intervention.
It changed only docs/guidance-maintenance.md. The unchanged independent checker
passed after implementation and review; the declared validator returned exit zero.
The candidate document was reviewed and copied unchanged into this PR.

The supervising build was copied outside the candidate from revision `85b2e21`.
Its retained hash snapshot, captured while the run was active, still matched at
completion. Candidate scope excluded the supervisor and independent checker.

All 170 deterministic Node tests passed, including migrated metadata cases, working
copy/AGENTS inventory, real source ownership and candidate-guidance scope rejection.
The checker makes no semantic or instruction-effectiveness guarantee. Guidance
review remains a steward activity; integration remains caller-owned.
