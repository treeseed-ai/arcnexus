# ArcNexus

Architecture-directed software development, with ArcNexus itself as an early target.
See the [charter](docs/charter.md) for purpose, the [development journey](docs/dev.md)
for all five phases, and the [phase-one retrospective](docs/phase-one-retrospective.md)
for evidence and coordination readiness. The [phase-one sequence](docs/plans/phase-one.md)
records the delivered implementation slices.

Requires Linux, Node >=22.13 <23, npm, Git, `setsid`, and an authenticated Codex CLI on PATH.

```sh
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js validate --project /path/to/repository
node dist/cli.js inspect identity "Implement the objective" --project /path/to/repository --json
node dist/cli.js prepare --project /path/to/repository
node dist/cli.js run identity "Implement the objective" --project /path/to/repository
```

Runs default to `gpt-6-luna` with medium reasoning; `--model` explicitly overrides it.

Targets declare [environment setup](docs/workspace/workspaces.md) and [components](docs/cli/stewards.md).
The application creates and retains a dedicated worktree. Review its evidence and
changes; commits, PRs and integration remain caller-owned. Use `cleanup <workspace-id>`
only after resolving candidate source changes. Branches and reports are preserved.

`npm test` runs deterministic built-CLI acceptance. `npm run check` checks TypeScript.
[CI](docs/development-tooling/ci.md) also validates repository guidance. The separate
[live acceptance](docs/acceptance/live-sample.md) invokes real model work explicitly.

See the [versioned architecture contract](docs/architecture/architecture-contract.md) for catalog
validation, immutable assignment inspection, and structured caller acceptance checks.

Validate tracked guidance in the current checkout with
`node dist/cli.js guidance validate --project .` after building. See
[guidance validation](docs/guidance-validation/guidance-validation.md) for the metadata-only contract and
[maintenance](docs/agent-guidance/guidance-maintenance.md) for stewardship ownership.

[Experiments](docs/experiments/experiments.md) provide explicit simulation and live qualification
modes through the same supervised runtime.

[Two-owner workdays](docs/workday/workdays.md) add bounded contract requests, verified
delivery and same-thread requester continuation in one managed candidate. Inspect
the captured manifest with `workday inspect`, execute with `workday run`, and use
`workday status` / `workday follow` for retained coordination evidence. SQLite is
private coordination state; ordinary single-steward commands remain available.
