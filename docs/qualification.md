# Single-steward qualification campaigns

Run `node scripts/qualify.mjs <manifest.json> <new-output-directory>` explicitly.
The command runs cases sequentially, once each, through a stable built ArcNexus CLI.
It never retries a campaign, changes models, commits or integrates candidates. Luna
and medium reasoning remain the captured execution profile. Deterministic CI uses
controlled Codex executables; live campaigns require the caller's existing authentication.

A manifest has `schemaVersion: 1`, absolute `runner` (built CLI), optional absolute
`codexPath`, and `cases`. Every case has unique `id`, absolute `project`, full `base`
commit, `component`, absolute structured `assignment`, `expectedOutcome`, optional
`bindings`, `issue`, `maxAttempts` (1 or 2), and `acceptance` command/argument arrays.
Acceptance arguments may use `{report}` for the retained report path. Optional
`faultInjection` describes a deliberate narrow defect introduced by a trusted,
captured host check; it is never presented as spontaneous defect discovery.

The supervisor and independent acceptance must remain outside candidate write scope.
Assignment inputs, host check artifacts and post-run acceptance artifact files are
snapshotted before the first case; commands list absolute `artifacts` to preserve.
The CLI snapshots host checks again as assignment authority before preparation.
The runner tree (built files and schemas) is hashed before and after the campaign;
a changed supervisor invalidates qualification. Use a verified isolated checkout/build.

Each case stores its stdout/stderr, exit status, elapsed time, full execution report,
assignment and check hashes, usage, intervention count and acceptance command output.
`campaign.json` is written initially and atomically updated after each case. A hard
interruption leaves explicit incomplete evidence; an existing output directory is
never overwritten. SIGINT/SIGTERM cancels the active CLI, retains evidence and stops
further cases. Expected blocked outcomes require exit 1 and independent owner-request
acceptance; they are not confused with failed inference. Other successful outcomes
require exit 0. Any unexpected result makes the final campaign exit nonzero, while
remaining cases still execute once unless cancelled.

The entry gate requires successful real changes on ArcNexus and TreeSeed, a labeled
corrective implementation repair, an SDK-owner boundary escalation, useful read-only
research and review, normal target verification and integration review. Campaign
success is evidence for that gate, never automatic permission to enter phase two.

The initial report assignment requires `## Outcome` and `## Activities` sections,
showing captured outcome and activity/status pairs without mutating evidence; older
records remain renderable. `qualification/check-report-summary.mjs` independently
checks this contract. `inject-report-fault.mjs` deliberately substitutes the outcome
inside the implementation once, rebuilds and runs that same check. Its external
receipt records pre-injection, injected and repaired implementation hashes.

A local no-inference probe of Codex 0.163.0-alpha.10.2 executed a Python program
under the named profile, wrote a completion marker in its allowed temporary directory,
and received read-only-filesystem errors for both the SDK dependency and assembly
`node_modules` subtree. Exit status alone was not used as proof of enforcement.

ArcNexus declares itself as the primary `arcnexus` repository with no dependencies;
TreeSeed declares `platform` as primary with pinned CLI/SDK dependency members. Both
real qualification targets therefore exercise the same explicit ownership contract.
