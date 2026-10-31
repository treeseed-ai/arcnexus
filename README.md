# ArcNexus

Architecture-directed software development, with ArcNexus itself as an early target.
See the [charter](docs/charter.md) for purpose, the [development journey](docs/dev.md)
for all five phases, and the [phase-one retrospective](docs/phase-one-retrospective.md)
for evidence and coordination readiness. The [phase-one sequence](docs/plans/phase-one.md)
records the delivered implementation slices.

Requires Linux, Node 22, npm, Git, `setsid`, and an authenticated Codex CLI on PATH.

```sh
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js prepare --project /path/to/repository
node dist/cli.js run identity "Implement the objective" --project /path/to/repository
```

Targets declare [environment setup](docs/workspaces.md) and [components](docs/stewards.md).
The application creates and retains a dedicated worktree. Review its evidence and
changes; commits, PRs and integration remain caller-owned. Use `cleanup <workspace-id>`
only after resolving candidate source changes. Branches and reports are preserved.

`npm test` runs deterministic built-CLI acceptance. `npm run check` checks TypeScript.
[CI](docs/ci.md) also validates repository guidance. The separate
[live acceptance](docs/acceptance/live-sample.md) invokes real model work explicitly.
