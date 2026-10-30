---
name: release-workflow
description: Use when starting repository changes, preparing a PR, integrating to staging, or preparing a release.
---

# ArcNexus release workflow

## Start a small change

1. Read AGENTS.md and the charter. Reuse accepted scope; read-only exploration does
   not require an issue. Before editing, create/adopt one issue with observable
   acceptance criteria. This skill authorizes issue/PR bookkeeping for that work.
2. Fetch origin. Branch from current `origin/staging` as
   `codex/<issue>-<description>`. Keep user work intact; never reset it. If staging
   does not exist in a new repository, create it from the verified remote main tip.
3. For new/changed behavior, record intent in affected docs and commit before product
   code; add a failing user-observable test, implement, and verify. For refactors,
   reference the unchanged contract and prove acceptance/characterization tests pass
   before and after; add missing coverage first. No redundant docs edit or artificial
   failing behavior is required. Add test layers for distinct risks, not a fixed quota.
   A docs-only change needs document validation rather than application tests.
4. Commit logical increments as `<type>: <description> (#N)`. Push the branch for
   review. Keep the issue's acceptance boxes accurate; do not duplicate every update
   as a comment. Comment for decisions, blockers, or scope changes that need context.

## Before a PR

Reload this skill. Inspect the full diff and verify acceptance at the current revision.
Sync current staging into the work branch if needed; resolve conflicts there.

- Docs/instructions: check links, consistency, intended behavior, and diff whitespace.
- Product behavior: run relevant tests, static checks, build, and the built program.
  Exercise production wiring, not just injected fakes. Demonstrate a real harness
  path when its behavior is introduced or changed; report live checks separately
  from deterministic CI.
- Use commands that actually exist in this repository. No manifest or CI means those
  checks are unavailable, not passed. Never fabricate commands or evidence.
- Add one human-readable `[Unreleased]` changelog entry from the PR title, with `(#N)`,
  grouped under Added, Fixed, or Changed for developer/user-visible changes.

Open a PR to `staging`, titled `<type>: <description> (#N)`. Include the problem and
result, acceptance evidence, exact verification results/limitations, and `Part of #N`.
Link the PR from the issue. A coherent instruction audit may touch many files; split
by independently useful outcomes, not an arbitrary file-count threshold.

## Integration gate

An agent may squash-merge to staging only when acceptance is met, applicable local
checks and CI pass, and review requirements are addressed. Inspect actual check runs
and repository rules. If required review rules cannot be established, leave the PR
open with that limitation. Verify checks and acceptance correspond to the current
PR head and integration result; a newer commit invalidates earlier readiness claims
until affected evidence is refreshed. Never approve a PR yourself. Missing CI does
not count as green: leave the PR open and report the missing gate rather than adding unrelated
infrastructure or silently waiving it.

After a merge, confirm its commit is on staging and no open PR uses the work branch.
Delete that branch remotely and locally, fetch/prune, and verify with
`git ls-remote --heads origin`. Squash merges need PR/commit evidence rather than
`git branch --merged`; use local `git branch -D` only after confirming integration.
Never delete main, staging, another open PR's branch, or unrelated unmerged work.

## Release boundary

Integration into staging is usable development progress, not a production release.
Issues remain open until release. Agents may prepare an RC to main; only the
maintainer approves/merges main, publishes tags, and authorizes production.

When asked to prepare a release:
- Determine the actual unreleased range from the previous release to candidate head.
  Derive shipping PRs and linked issues from that range, not all historical merged PRs.
- Check every closing issue's acceptance evidence; omit incomplete issues from the
  closing list and name their deficit. Omitting `Closes #N` does not remove code from
  the candidate: identify any partial implementation still included. The maintainer
  decides whether that content may ship or must be completed/removed before release.
  Include `Closes #N` only in the RC targeting the default main branch.
- Version/changelog changes use an issue-linked branch and staging PR too; never
  commit directly on staging. Follow the established version convention; if none
  exists, settle it for the first release. Do not bump a version for every docs PR.
- Keep only one active RC and record its candidate head SHA. A PR sourced from
  staging changes when staging advances. Before declaring it ready, compare heads;
  refresh the shipping list, changelog, closure list, and affected acceptance/CI/review
  evidence. Identify added scope for the maintainer's decision; prior approval does
  not silently approve it. Normal staging development need not stop while an RC waits.
  Do not rewrite published tags. Hotfixes require maintainer direction.

Prefer connected GitHub tools; use local Git and CLI for unsupported operations.
Use HTTPS, structured bodies or `--body-file`, and preserve secrets. This file is
the sole local release procedure; other skills must not introduce merge authority.
