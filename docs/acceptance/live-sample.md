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
npm dependencies. The `report` component permits only its implementation, dedicated
report tests and report documentation. A stable runner outside the candidate drives
that assignment; the caller supplies an issue and refreshed staging base.

The supervisor's `node scripts/check-report.mjs <candidate-workspace>` checks the
self-development result after building the candidate: a Changed files section,
paths sorted independently of input order, each associated with its Git change kind,
and no mutation of the captured input. It must fail against the pre-change runner.
