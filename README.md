# ArcNexus

Architecture-directed software development, with ArcNexus itself as an early target.
The [charter](docs/charter.md) defines its purpose and phase gates. General execution
is a phase-two extension; phase three remains blocked until the
[qualification requirements](docs/plans/general-agent-execution-qualification.md) pass.

Requires Linux, Node >=22.13 <23, npm, Git, `setsid`, and an authenticated Codex CLI.

```sh
npm ci
npm run build
node dist/cli.js --help
```

From a configured target repository, use either a self-directed workday or an
external task. These are the normal execution commands:

```sh
arcnexus workday start
arcnexus workday pause
arcnexus workday resume
arcnexus workday stop
arcnexus workday status

arcnexus task run "Implement the objective"
```

A workday runs in a background host, rotating fairly through eligible component
stewards and servicing inbox requests. It stays idle when no relevant inputs change.
Pause finishes the active turn and checkpoint; stop cancels managed execution and
retains evidence. A task uses a director to select starting owners and assess the
goal. Workers can request additional existing owners through persisted inboxes.
Execution is sequential within a project, with no fixed participant count.

A task automatically pauses an active workday and returns control afterward.
An explicit user pause or stop takes precedence. Task commands stream progress and
ask substantive clarification questions in a terminal; noninteractive tasks retain
`needs_input` with their questions and evidence location.

Project/package discovery, profiles, verification and executable bindings are
resolved automatically. New work requires a clean committed source checkout.
See [the execution guide](docs/gateway/cli/stewards.md) for setup and lifecycle details,
and [the general fixture](fixtures/general/README.md) for a complete three-owner
package. ArcNexus's own profiles select Luna engineering and Astra direction/review.
Machine-specific executable paths belong in the automatically discovered local
bindings file, outside captured source authority.

Verified changes accumulate in an application-owned candidate. Unfinished work stays
isolated. Host checks, regression evidence and independent review establish delivery;
a task also requires goal-level assessment. Review the retained diff and evidence
before caller integration. Workers cannot commit, switch branches or publish.

General execution has no time, turn, operation-call or corrective-attempt budget.
Cancellation, transport safeguards, observable progress detection and test watchdogs
remain. Obsolete executable budget configuration receives migration diagnostics;
historical reports remain readable.

Maintained configuration is YAML; legacy JSON remains supported. Evidence remains
JSON. [Ownership](docs/library/architecture/configuration.md) and component boundaries
keep write authority explicit. Candidate instruction, test or permission edits cannot
replace the authority captured for the active run.

Useful development and inspection commands remain available:

```sh
node dist/cli.js validate --project .
node dist/cli.js guidance validate --project .
node dist/cli.js test inspect --project .
node dist/cli.js test run --project .
```

Run `npm run format:check`, `npm run lint`, `npm run check` and `npm run build` before
qualification. Deterministic tests, [CI](docs/release/ci.md) and live model execution
provide distinct evidence. [Experiments](docs/library/experiments/experiments.md)
label simulation and live runs explicitly. Legacy execution commands are retired; historical reports and manifests remain
inspectable. Active campaigns use the shared task host.
