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
3. Record intent in the affected docs and commit before product code. Add a failing
   user-observable test, implement, and verify. Add other test layers for distinct
   risks rather than a fixed quota. A docs-only change needs no application test suite.
4. Commit logical increments as `<type>: <description> (#N)`. Push the branch for
   review. Keep the issue's acceptance boxes accurate; do not duplicate every update
   as a comment. Comment for decisions, blockers, or scope changes that need context.

## Before a PR

Reload this skill. Inspect the full diff and verify acceptance at the current revision.
Sync current staging into the work branch if needed; resolve conflicts there.

- Docs/instructions: check links, consistency, intended behavior, and diff whitespace.
- Product behavior: run relevant tests, static checks, build, and the built program.
  Exercise production wiring, not just injected fakes. Demonstrate a real harness
  path for new harness behavior; report live checks separately from deterministic CI.
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
open with that limitation. Never approve a PR yourself. Missing CI does not count as
green: leave the PR open and report the missing gate rather than adding unrelated
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
- Check every closing issue's acceptance evidence; hold incomplete issues out and
  name their deficit. Include `Closes #N` only in the RC targeting the default main branch.
- Version/changelog changes use an issue-linked branch and staging PR too; never
  commit directly on staging. Follow the established version convention; if none
  exists, settle it for the first release. Do not bump a version for every docs PR.
- Keep only one active RC. New scope requires an explicit decision about that RC.
  Do not rewrite published tags. Hotfixes require maintainer direction.

Prefer connected GitHub tools; use local Git and CLI for unsupported operations.
Use HTTPS, structured bodies or `--body-file`, and preserve secrets. This file is
the sole local release procedure; other skills must not introduce merge authority.
