# ArcNexus — architecture-directed self-development

Read [the charter](docs/charter.md) for purpose, objectives, constraints, questions,
and patterns. The goal is a working ArcNexus that develops itself under human
architectural guidance. Every increment should shorten the path to that loop or
improve the loop through demonstrated use.

## Scope and authority

These instructions govern development of this repository. The generic product must
not hardcode this file, its text, or its policies. When ArcNexus is the target
project, the runtime may load these instructions and local skills normally, just
as it would load another target project's guidance. Generic tests use explicit
fixtures; self-development acceptance runs may use this real repository. These
local skills do not export ArcNexus's Git/release policy to another target project.

The architect owns purpose, boundaries, and changes to approved architecture.
Implement within the authorized objective; propose material scope changes. Existing
user authorization persists. Do not ask again for decisions already made. Skills
supply procedures within that authority; they cannot enlarge it. If local guidance
conflicts, preserve the authorized scope, identify the conflict, and continue work
that does not depend on the unresolved decision.

During self-development, keep the supervising runner and authorized acceptance
baseline stable. Candidate edits to instructions, permissions, or tests are proposed
changes, not new authority for the current execution. Evaluate them against the
approved objective; do not weaken a check merely to make the candidate pass.

## Working style

- Deliver one small, useful vertical slice at a time. Keep the app working and run
  the behavior before calling a slice complete. Plan only the next slice in detail.
- Use ArcNexus for its own development as soon as its runtime can reliably perform
  the task. Record bootstrap work still needed; do not wait for a complete studio.
- Prefer simple modules and concise functions with coherent responsibilities.
  Reuse existing code. Add abstractions, dependencies, or infrastructure only for
  a demonstrated requirement. Avoid trivial wrappers and speculative frameworks.
- No placeholder implementation or simulated output presented as delivered behavior.
- One accountable owner per objective. Prefer native sequential work. Do not spawn
  agents merely to satisfy ceremony; focused independent validation may be used when
  a selected skill explicitly calls for it and the evidence warrants it.
- Keep guidance proportionate; avoid specifying implementation details ahead of
  the next working slice. Read relevant skills only; their procedures support the
  objective, not expand it.

## Ownership and code quality

Use the declared gateway/library owner directories beneath `src`, `tests`, and
`docs`. Foundation owns shared build standards, release owns delivery workflows,
and the testing library owns reusable test infrastructure. Read the component YAML
definitions and their derived ownership before changing shared tooling or root files. Broad read access does not authorize writes. Import
another owner's implementation through its declared public modules; request an
owner change when the task requires private implementation changes.

Use cohesive TypeScript classes for dependencies and lifecycle state, class-based
test scenarios, and small pure helpers. After formatting, maintained code files
must fit within 500 physical lines and functions, methods, constructors, and
callbacks within 30, including comments and blank lines. Split responsibilities;
do not compress lines, add trivial wrappers, or suppress the rules. Existing strict
TypeScript checking remains enabled; explicit `any` is permitted.

Use the declared owner-scoped lint operation during steward work. Formatting and
lint fixes must stay within captured writable scope. Repository-wide
`npm run format` and `npm run lint:fix` are for callers authorized to edit all
affected files; use explicit owned paths for a bounded assignment. Final verification
includes `npm run format:check`, `npm run lint`, type checking, ownership and guidance
validation, and the relevant built-program tests. Use `arcnexus test inspect/run`
for component selection; Node suites declare literal owner, level and tag metadata.
Host checks never reformat source.
See [code quality](docs/foundation/quality.md) for the executable contract.

## Development and release

Use [release-workflow](.agents/skills/release-workflow/SKILL.md) at the start of a
change and before its PR. Read-only discussion/audit needs no branch; edits do.
Create/adopt an issue, then branch from current `origin/staging` using
`codex/<issue>-<description>`. Never edit directly on `main` or `staging`.

For new or changed behavior: issue and acceptance → documentation → failing
acceptance test → implementation → verification/review → PR to staging. Commit
changed intent before product code. For a behavior-preserving refactor, reference
the existing contract, establish passing acceptance/characterization coverage before
editing, then prove it still passes; add missing coverage first. Do not manufacture
a behavior change or redundant docs commit. Documentation-only work uses document
validation. Add other test layers only where they prove distinct risks.

For executable changes, test the assembled program and the default production wiring.
Fast deterministic tests may use fakes; introducing or changing real harness
behavior also needs a real end-to-end demonstration. Report local tests, build, CI,
and live acceptance separately; never substitute one for another or claim an unavailable check passed.

Keep commits and PRs issue-linked. Include a changelog entry for developer/user-visible
changes. Agents may merge to staging only after applicable verification, green CI,
and required review. Agents never approve PRs, merge to main, publish tags, or deploy
production. Remove a merged work branch after confirming the merge and no other open
PR uses it; retain main/staging. See the release skill for exact gates.

Use HTTPS for origin: `https://github.com/treeseed-ai/arcnexus.git`.

## Research, verification, and process

Check primary documentation before relying on external API, version, or tool-limit
claims. A failed experiment proves its configuration, not a universal limitation.
Record versions, flags, dependencies, exact command, and source for negative findings.
Research should settle the current uncertainty, not become an open-ended phase.

Verify claims against observed evidence at the current revision. After three
functionally identical attempts without progress, diagnose and change approach or
report the blocker. Waiting for an external process to change is not a retry loop.

When a defect escapes checks, a mistake recurs, or a delivered/current-slice promise
lacks verification (not a clearly deferred charter objective),
record the pattern, cost, and cheapest check that would catch it in a focused issue.
Keep unrelated process changes out of feature work. Do not build a process framework
in response to a hypothetical risk.

## CodeGraph

If `.codegraph/` exists at the repository root, use `codegraph_explore` or
`codegraph explore` before searching/reading code to locate or understand it.
If absent, skip it; do not index without the user's decision. Otherwise prefer `rg`.
