# Repeatable live coding acceptance

After `npm ci && npm run build`, run `node scripts/live-sample.mjs`.
This explicitly invokes live Codex twice, sequentially, using the current login.
It is never part of CI. Each attempt gets a new application-managed worktree from
the same committed fixture revision, runs `npm ci`, then baseline and final tests.
Sources, candidates and evidence remain in the user's ArcNexus state directory.

The committed fixture is a working identity library with normalization behavior.
The assignment adds `isSessionExpired(expiresAtMs, nowMs)` in `src/identity.mjs`,
returns `nowMs >= expiresAtMs`, documents it, and adds observable tests.

`node scripts/check-sample.mjs <candidate-workspace>` is an independent acceptance
check, owned by the supervisor and outside candidate scope. It checks normalization
and expiration before, at and after several timestamps. The live script requires
runtime completion, docs/test edits and independent acceptance for each candidate.
CI tests that the independent checker rejects missing and incorrect implementations
and accepts the specified boundary. Those synthetic checker tests are not live evidence.

For self-development, `architecture/environment.json` installs this repository's
npm dependencies and creates a local Python venv for the repository checks.
The captured verification includes TypeScript, built-CLI tests, Python acceptance
and skill validation. Their declared generated directories stay cleanup-safe. The `report` component permits only its implementation, dedicated
report tests and report documentation. A stable runner outside the candidate drives
that assignment; the caller supplies an issue and refreshed staging base.

The supervisor's `node scripts/check-report.mjs <candidate-workspace>` checks the
self-development result after building the candidate: a Changed files section,
paths sorted independently of input order, each associated with its Git change kind,
and no mutation of the captured input. It must fail against the pre-change runner.

## Observed live evidence

On 2026-10-31 both fresh runs completed and passed the external checker.
Configuration: Node 22.22.1, SDK 0.166.0, Codex CLI 0.163.0-alpha.10.2,
Astra/medium, existing ChatGPT login, workspace-write, approvals disabled.

- Run `73ea97a8-ef61-4cf5-97f9-3b3db259336a`, thread `01a18f59-8774-7c63-93a9-a4d9c7cdf208`: npm setup, baseline and final checks passed; docs, tests and identity implementation changed.
- Run `f19dcde8-0a0c-497d-9eb0-1213401c6ae0`, thread `01a18f5a-1302-7fb3-8fdd-cf31ef92ed01`: npm setup, baseline and final checks passed; docs, tests and identity implementation changed.

Both used base `0cf161421bd1ad1d27bc70130a3e133482de25b8`.
Local fixture source and independent checker logs are retained under
`/home/adrian/.local/state/arcnexus/samples/identity-Mlloua`; run records and candidates are retained in the normal state directories.
Neither candidate changed the source repository. The sample implementation was produced
by Codex in each candidate; the committed fixture intentionally remains the pre-change baseline.
