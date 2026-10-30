# Development guidance audit — 2026-10-30

Scope: AGENTS.md and all ten repository-local SKILL.md entrypoints. Issue #1.
No product implementation or detailed phase-one plan belongs to this change.

## Findings and disposition

| Surface | Observed mismatch | Alignment |
| --- | --- | --- |
| AGENTS.md | Names Treeseed, assumes a monorepo, cites unrelated incidents; excludes all use of its contents by runtime/tests, which is ambiguous for self-development | Name ArcNexus; link the charter; distinguish generic runtime behavior from instructions legitimately loaded from its target project |
| release-workflow | 894 lines; duplicated rules; unrelated `@saip/docs` command; demands all test tiers even for docs; direct staging version commit conflicts with branch rule; tag deletion conflicts with immutable tags | One concise release authority; preserve issue/branch/docs/test/PR gates; apply checks by change type; version changes use a branch; never rewrite published tags |
| brainstorming | Requires repeated questions and approval even with extensive agreed context; mandatory visual-server and reviewer choreography | Reuse confirmed context; ask only material missing questions; describe the next useful slice; no automatic second approval |
| writing-plans | Specifies internal signatures and test code in advance; requires unavailable superpowers execution skills and execution-method selection | Short current-slice plan with observable acceptance, affected responsibilities, risks, and verification; native execution by default |
| doc-coauthoring | 375-line workshop, 5–10 questions and 5–20 options per section, repeated permission prompts | Draft from supplied context; focused reader check when ambiguity warrants it |
| documentation-writer | Requires outline approval for every edit and forbids external research | Infer audience/type from request; use primary sources for external claims; update only affected docs |
| writing-skills | Depends on missing superpowers skills; unconditional multi-agent pressure tests and five-repeat microtests; delete-and-restart instructions | Proportionate scenario validation, self-contained guidance, preserve work, no recursive process framework |
| verification-before-completion | Valuable evidence principle mixed with full reruns for every positive statement | Evidence tied to current revision and exact claim; rerun when affected inputs change; distinguish documentation checks from runtime proof |
| gh-cli | Bulk PR approval example violates project boundary; token-print example; assumes CLI for everything | Tool reference only; prefer connector, CLI fallback; inspect local help; preserve permissions and secrets |
| github-ops | Unrequested stale closures, weekly monitoring, foreign ECC release checklist, release creation outside project boundary | Act only on requested scope; release-workflow governs merging/publishing; no automatic maintenance expansion |
| find-skills | Broad triggers, popularity thresholds treated as quality, wrong `.dsh/skills` destination | Search only for requested or concrete missing capability; inspect source/fit; explicit installation authorization; project-local destination |

The ten entrypoints originally total 3,007 lines. The problem is not length alone:
conflicting authorities and obligatory ceremonies can prevent a small working result.
The cheapest correction is one project contract plus short, scoped skills, with
realistic decision scenarios to expose conflicts. Preserve historical source in Git;
remove obsolete support files only after confirming they have no remaining callers.

## Safeguards retained

Issue-linked branches from staging; documentation before behavior changes; failing
user-observable tests before implementation; built-artifact and real integration
verification; no self-approval or agent merge to main; explicit release ownership;
changelog traceability; merged branch cleanup; bounded retries; evidence-based reporting.

## Boundary clarified for self-development

ArcNexus must be generic with respect to target-project guidance. It may read this
repository's AGENTS.md and skills when this repository is its target, just as it may
read another target's instructions. Product code and generic tests must not hardcode
this particular file's text, paths, or policies. Behavioral tests use explicit fixtures.
Human architecture remains authoritative when the software edits its own implementation.

## Validation scenarios

1. Approved docs-only correction with no package or CI: issue/branch, focused edit,
   reference/diff checks; report CI absent, never invent a passing application build.
2. Phase-one plan after confirmed charter: one-steward CLI slice; no UI, inbox,
   model-router, or exhaustive function design as prerequisites.
3. Green staging PR: check actual acceptance and review requirements; main merge,
   approval, tag publication, and production remain with maintainer.
4. Skill correction without superpowers installed: self-contained scenario validation;
   no missing-skill dependency or recursive installation task.
5. ArcNexus targets itself: load target instructions normally; preserve architectural
   authority and verify candidate changes independently of the running stable version.
6. Provider accepts contract change: do not claim release availability or complete
   the dependent assignment; preserve owner and required readiness milestone.

Baseline and revised-guidance evaluation results are recorded below after inspection.

### Baseline result

A read-only independent agent replayed scenarios 1–4 before edits. It found the
nonexistent docs command and unconditional build/CI gates block docs-only bootstrap;
planning depends on absent superpowers skills and precommitted internal signatures;
staging release instructions allow a direct commit against the branch rule; skill
editing requires absent dependencies and repeated microtests. It also independently
identified the self-development ambiguity. No baseline product execution was attempted.

### Revised guidance and resources

All ten skill entrypoints now pass the skill-creator format validator. The independent
reader replayed the scenarios and found the baseline behavioral conflicts resolved.
It caught an overbroad instruction to keep all documentation smaller than nonexistent
bootstrap code; that was corrected to proportional guidance for the next slice.
Missing CI remains an explicit integration gate, not a fabricated pass.

The old visual-companion server, builder prompt, ECC release checklist, and copied
skill-authoring support materials have no callers outside their former skill bundles.
Their roles and references were inspected; they were removed with the workflows they
supported. Git retains their history. They are not latent alternative instructions
for future agents to discover. No product runtime used these files.

These are scoped scenario and static checks, not proof of universal agent compliance.
There is no application build, product test suite, or CI workflow in this repository
yet. This change does not claim runtime acceptance or readiness to merge without CI.
