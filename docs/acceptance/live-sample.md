# Repeatable live coding acceptance

The original Astra acceptance used `npm ci && npm run build`, then
`node scripts/live-sample.mjs`. That script currently inherits the CLI model default;
do not use it unchanged for the Luna baseline. Subsequent live tests must pass
`--model gpt-6-luna` to each `dist/cli.js run` invocation.
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
npm dependencies and uses host-installed `uv` to create a local Python venv for
the repository checks, with automatic Python downloads disabled.
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

Preparation spike: Python 3.14.4 `python3 -m venv .venv` failed because this host
lacks ensurepip (run `018247ae-e8e3-44d0-b9b3-aa8ccafc896a`, retained).
No system installation was attempted. The declared setup uses installed uv 0.13.1
instead; see [uv environment documentation](https://docs.astral.sh/uv/pip/environments/).

## Luna baseline

After the architect selected Luna-sized models as the intended steward baseline,
the same sample passed twice with `--model gpt-6-luna`, medium reasoning, and the
same independent checker and execution boundaries. The caller copied the existing
live harness outside the repository, resolved its supervisor/import paths, and
added only that model selection to the CLI invocation. No runtime or acceptance
criteria changed. The exact harness is retained as `luna-harness.mjs` under
`/home/adrian/.local/state/arcnexus/samples/identity-1569nY`, alongside both CLI
outputs, independent checker logs and `acceptance.json`.

- Run `89a49ca1-6984-4423-a0b8-0ed791ba8b0c`, thread `01a18f70-e433-7543-81fd-e84a583731b0`: completed in 19.1 seconds.
- Run `0b9c1446-cdf2-4b1a-8f09-9d5f9671e69a`, thread `01a18f71-2fdf-74a2-acc8-79d7bb1959f2`: completed in 18.7 seconds.

Both used fresh application-created worktrees from fixture base
`c269621fe1c70b7cf47d31c81f7a690fd1c22605`, installed dependencies, passed baseline
and final verification, changed implementation/docs/tests, and passed the independent
before/at/after boundary check. The source remained clean. Reports explicitly record
`gpt-6-luna`; the supervising ArcNexus source revision was
`73e712f91f6fed4bb9f043434ede2813fbfbf249` with documentation-only work in progress.

This proves the small sample on Luna, not yet self-development or coordination on
Luna. The earlier Astra self-development evidence remains separately labelled.
