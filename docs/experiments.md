# Repeatable experiments

Inspect without preparation or inference:

```sh
node dist/cli.js experiment inspect experiments/operations.json --bindings /absolute/local-bindings.json --json
```

Execute once, with an explicit evidence mode:

```sh
node dist/cli.js experiment run experiments/operations.json --bindings /absolute/local-bindings.json --mode live --output /absolute/new-campaign
node dist/cli.js experiment run experiments/simulation.json --bindings /absolute/simulation-bindings.json --mode simulation
```

A missing mode is an input error. Inspection reports mode as unselected; it never
selects a paid execution default. Inspection resolves tracked architecture and all
case inputs without creating state. Run defaults to a unique experiment directory
beneath ArcNexus user state; explicit output must be new and outside target repositories.
Exit codes are 0 campaign expectations met, 1 unexpected execution/check failure,
2 invalid inputs/preflight, and 130 cancellation.

## Definitions and local bindings

Version-1 experiment manifests declare `modes` and ordered `cases`. Each case names
an `id`, project binding key, component, assignment file, expected outcome, independent
acceptance commands, and optional attempt limit/fault-injection description/scenario.
A case may pin `base` directly; otherwise its project binding must supply a full
40-character commit. Branch names and implicit HEAD selection are rejected.
Paths in assignments and acceptance are relative to their defining JSON file.
Executable names resolve only through explicit tool bindings; no shell strings or
arbitrary configuration expressions are evaluated. Acceptance may use `{report}`;
assignment host checks may use `{faultMarker}` for a host-owned per-case marker.

Bindings have `schemaVersion: 1`, `runner` (absolute verified built CLI), optional
`codexPath` (required in live mode), `projects` keyed by identity with absolute `path`
and optional pinned `base`/workspace `bindings` file, `tools` mapping executable
names to absolute executables, optional `issues` keyed by case, and `priorEvidence`
keyed by selection identity. A prior-evidence selection supplies absolute path,
sourceId, revision and reason; a case's `priorEvidenceIds` selects those records.
No whole conversation or report is silently imported.

The resolved input includes immutable revisions and input hashes. Before execution,
all assignments, selected evidence, workspace bindings and declared acceptance
artifacts are snapshotted. Later candidate edits cannot redefine them. The supervising
build is hashed before cases, checked before each subsequent case and at completion.
A changed supervisor invalidates the campaign and prevents further executions.

## Simulation and live evidence

`experiments/simulation.json` uses only the bundled `single-steward-v1` fixture
contract and fixed success, repair, boundary and failure scenarios. The caller
copies `fixtures/simulation` into an independent Git repository, commits it and
provides that immutable commit in bindings. The application does not initialize,
clone or fetch repositories. Altered fixture contracts are rejected before execution.

Simulation uses a bundled controlled executable through the real SDK, launcher and
bridge. File edits, Git worktrees and host checks are real; agent responses and usage
are scripted and labeled simulated. The bundled four-case example deliberately includes an unexpected execution failure:
its first three cases should pass and its fourth remains failed, so the campaign
returns exit 1. It needs no credentials or inference calls and
cannot satisfy live-model qualification. It does not prove installed Codex sandbox
behavior. No custom scenario language or arbitrary scripted model actions are exposed.

Live mode invokes Luna/medium using existing Codex authentication. It performs the
same bounded workflow and independent checks. Reports distinguish actual model
usage from scripted counters. Expected blocked outcomes need independently checked
owner requests. Unexpected failures remain failures, not accepted simulations.

Cases run once in order. Ordinary failures retain evidence and later cases still
run; cancellation stops the active CLI and subsequent cases. Independent supervisors
stop managed processes on parent loss. Each assignment retains its overall budget;
post-run checks remain bounded to 120 seconds, with bounded logs. A hard interruption
leaves an incomplete campaign; no resume, automatic retry or model escalation occurs.

Campaign JSON and Markdown retain mode, revisions, hashes, case reports, usage,
interventions, checks and resource shutdown. Source checkouts and candidate branches
are preserved; no automatic cleanup or integration occurs. Disposable worktrees
protect source checkouts, but declared host commands are trusted and may have host
or external effects. This is not universal OS isolation.

The legacy `node scripts/qualify.mjs <manifest> <output>` remains a compatibility
entry point to the same TypeScript runner. Historical reports remain readable;
legacy evidence is not retroactively labeled simulated or live.

## Phase-two acceptance seed

The guidance steward encounters a proposed metadata rule absent from the checker.
It must name guidance-validation, provide observed evidence, desired behavior and
acceptance conditions, and explain why implementation is outside its scope. Phase
two will deliver the bounded request, owner response, verified validator change and
resumption. This increment records the scenario without implementing cooperation.

A concrete first coordination fixture can propose an optional `references` metadata
list whose repository-relative documentation targets must exist and stay inside the
repository. This is a proposed phase-two rule, not current checker behavior. The
first guidance assignment demonstrates a broken reference, requests that deterministic
rule from `guidance-validation`, and names accepted/rejected fixture examples. It must
stop before editing validator implementation. Phase two succeeds when the owner makes
and independently verifies the bounded checker change, returns captured evidence,
and the original steward resumes and validates its guidance. The architect still
accepts the proposed rule; neither steward grants itself new authority.

See [integrated qualification evidence](acceptance/experiments.md) for the completed
live campaign and the separate simulation guarantees.
