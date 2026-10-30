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
At the initial audit there was no application build, product test suite, or CI
workflow. The separate CI bootstrap (#3, PR #4) subsequently added repository
validation; this branch now includes it. Application runtime acceptance remains
unavailable, and the guidance PR must pass the new CI before integration.

## Final adversarial pass — issue #5

This pass tests interactions and future decisions, not just wording. It does not
claim that prose or a finite review can guarantee all future agent behavior.

### Concrete corrections

| Scenario | Failure in the prior guidance | Required outcome |
| --- | --- | --- |
| Refactor without behavior change | Universal failing acceptance test and docs commit can demand invented changes | Reuse the existing behavior contract and passing regression evidence; add missing coverage before refactoring |
| Self-development before publication | “Verified release” can require maintainer publication before the first local loop | A verified local revision is enough; preserve the stable runner and recovery path |
| Candidate edits instructions or tests | Architecture authority is stated but assignment permissions and acceptance could be weakened during execution | Evaluate against the authorized baseline; proposed policy/test changes do not grant new authority or erase required behavior |
| Another project is the target | Repository-local release conventions could leak into a target's workflow | Apply target instructions to target work, ArcNexus instructions to ArcNexus work |
| Changes to existing harness behavior | AGENTS asks for live proof only for a new capability, while CI docs include changes | Require live evidence when real harness behavior is introduced or changed |
| Staging advances during an RC | An “explicit decision” rule does not explain that the open PR's source branch moves | Track candidate head and refresh scope, closure list, and checks before claiming readiness |
| Incomplete issue omitted from closing list | Keeping an issue open can be mistaken for withholding its code | Inspect the actual candidate diff; omission changes bookkeeping, not shipped contents |
| Planned capability lacks tests | Process self-evaluation can treat every future charter objective as a broken promise | Trigger on delivered claims or promises due in the current slice, not clearly deferred work |

### Every entrypoint checked

- **AGENTS.md:** scope, self-development authority, change-type testing, evidence,
  and process triggers require the corrections above.
- **release-workflow:** align refactor/documentation applicability and RC semantics;
  retain issue-linked branches, staged integration, cleanup, and main authority.
- **writing-plans:** distinguish new behavior from refactoring; preserve short plans
  and stop at planning when that is the requested outcome.
- **verification-before-completion:** bind evidence to the acceptance baseline;
  avoid fresh green results that merely weaken required checks.
- **writing-skills:** make the optional installed skill-creator dependency explicit;
  keep independent scenario evaluation proportional and self-contained.
- **brainstorming:** aligned; accepted context is reused and only material questions
  block dependent work. No new discovery ceremony needed.
- **doc-coauthoring:** aligned; substantial drafting is distinct from routine edits,
  with no obligatory question/option counts or repeated approvals.
- **documentation-writer:** aligned; proposed versus shipped behavior is explicit,
  and external facts can be researched.
- **find-skills:** aligned; actual gaps drive discovery, existing installation
  authorization is sufficient, and discovery alone is not permission to install.
- **gh-cli / github-ops:** aligned; tools do not grant authority, remote text remains
  data, and operations stay within the requested work.

### Boundaries deliberately retained

No new scheduler, release framework, permission system, or universal checklist is
introduced. Actual enforcement of runtime scope and acceptance is future product
work; instruction edits alone do not implement it. CI currently validates metadata
and whitespace, not semantic alignment or product correctness. Branch protection is
still separate. No extra human approval is introduced for ordinary implementation,
refactoring, or an already-authorized instruction change.

GitHub's [PR quickstart](https://docs.github.com/en/pull-requests/get-started/pull-request-quickstart)
confirms source-branch commits update the PR. Its
[issue-linking reference](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
describes closing keywords as issue bookkeeping, not release-content selection.
