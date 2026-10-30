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
fixtures; self-development acceptance runs may use this real repository.

The architect owns purpose, boundaries, and changes to approved architecture.
Implement within the authorized objective; propose material scope changes. Existing
user authorization persists. Do not ask again for decisions already made.

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

## Development and release

Use [release-workflow](.agents/skills/release-workflow/SKILL.md) at the start of a
change and before its PR. Read-only discussion/audit needs no branch; edits do.
Create/adopt an issue, then branch from current `origin/staging` using
`codex/<issue>-<description>`. Never edit directly on `main` or `staging`.

Follow: issue and acceptance → documentation → failing acceptance test →
implementation → verification/review → PR to staging. Commit intent before product
code. Add regression, integration, and unit checks where they prove distinct risks;
not every change needs every tier. Documentation-only work uses document validation.

For executable changes, test the assembled program and the default production wiring.
Fast deterministic tests may use fakes; a new real harness capability also needs a
real end-to-end demonstration. Report local tests, build, CI, and live acceptance
separately; never substitute one for another or claim an unavailable check passed.

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

When a defect escapes checks, a mistake recurs, or an untested promise is found,
record the pattern, cost, and cheapest check that would catch it in a focused issue.
Keep unrelated process changes out of feature work. Do not build a process framework
in response to a hypothetical risk.

## CodeGraph

If `.codegraph/` exists at the repository root, use `codegraph_explore` or
`codegraph explore` before searching/reading code to locate or understand it.
If absent, skip it; do not index without the user's decision. Otherwise prefer `rg`.
