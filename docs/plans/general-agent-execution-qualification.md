# General execution qualification — issue 78

This is an implementation record, not a phase-three readiness declaration. Phase
three remains blocked until the charter's real execution gates pass. The branch is
`codex/78-general-agent-execution`; source authority and the supervising build are
held stable for each live attempt.

## Observed deterministic evidence

| Revision | Evidence | Result |
| --- | --- | --- |
| `635ca2b` | Full declared built-program suite, `/tmp/arcnexus-78-full-suite-v2.log` | 347 passed; predates subsequent recovery and fairness changes |
| `90cf16d` | Runtime promotion tests, `/tmp/arcnexus-78-promotion-tests.log` | 11 passed |
| `cfbe2b2` | Recovery tests, `/tmp/arcnexus-78-reconcile-tests.log` | 5 passed; uncertain reconciliation does not replay setup |
| `70115a3` | Scheduler, inbox and recovery tests, `/tmp/arcnexus-81-green-final.log` | 14 passed; queue and rotation regressions first failed against the prior build |
| `510b877` | Inbox/CLI checks, `/tmp/arcnexus-78-request-green.log`, and additional inbox check, `/tmp/arcnexus-78-request-inbox-final.log` | Passed; recipient workflow/scope regression first failed against the prior build |
| `510b877` | Full declared suite, `/tmp/arcnexus-78-full-suite-v5.log` | Running at this record's creation; no pass claimed |

Ownership and guidance validation passed at `510b877`. Build, strict type checking,
formatting and lint have local evidence in `/tmp/arcnexus-78-*-v5.log` and
`/tmp/arcnexus-78-request-*.log`. These local checks do not establish CI or live
qualification. Final-revision checks must be refreshed after further changes.

## Real harness attempts

Retained evidence root:
`/home/adrian/.local/state/arcnexus-qualification-78`.
The harness is `/usr/lib/chatgpt/resources/codex`, reporting
`codex-cli 0.163.0-alpha.10.2`, using existing ChatGPT authentication. Node is
`22.22.1`, Git is `2.53.0`. Machine executable binding is outside source authority
at the repository common Git directory's `arcnexus/bindings.yaml`.

Each attempt uses a clean detached source worktree and a separate copied stable
supervisor; source edits to this implementation branch cannot alter its runner.
The command is `node <stable-supervisor>/dist/cli.js task run "<prompt>"` from the
captured source worktree, with `ARCNEXUS_STATE_DIR` set to the evidence root. The
prompt requests actual documentation improvements by task-intake, with workday
and report owners discovered during execution. No simulated output counts here.

| Attempt | Captured revision | Observation |
| --- | --- | --- |
| Original | `843335c` | Real director selected task-intake. Repeated synchronous catalog capture stalled IPC; retained task was cancelled. Issue 79 records the defect and regression. |
| v2 | `635ca2b` | IPC remained responsive. Baseline passed, then the provider rejected optional properties in the strict inbox response schema. Issue 80 records the actual HTTP 400 and schema correction. |
| v3 | `b760d1f` | Preflight rejected an undeclared cross-owner test helper import. Public boundary declaration was corrected in `d4f65f8`; no model work counted. |
| v4 | `90cf16d` | Real task-intake steward edited its own documentation and dynamically requested workday/report owners. Its additional exact-scope/read-only request could not be expressed by the captured protocol. Cancelled during recipient baseline; partial edits and evidence retained, no verified delivery claimed. |
| v5 | `510b877` | Running with explicit recipient workflow/scope fields, durable FIFO scheduling and automatic independent-review instructions. Outcome pending. |

v4 task: `70d5d427-2dcc-4e6d-8659-3b176c297a2f`.
Its task-intake record is `59692f1c-e30d-4b9c-9eaf-5b29939fea0c`.
Inspect raw reports under `runs/<record>/report.json`, task projections under
`projects/<project>/reports/<task>.json`, and `live-task*.log` for observed CLI
progress. Worker claims, host checks and independent review are separate evidence.

## Remaining qualification and implementation work

All six live gates remain unqualified: three-owner verified task delivery;
self-directed workday improvement with inbox work; retained partial work across
pause/resume; task interruption and return; cancellation/host-loss recovery; and
an independently verified ArcNexus improvement with its actual diff retained.

Implementation still needs integrated qualification of assembled-candidate checks,
director reconsideration after blocked/decomposition changes, lifecycle and crash
race cases, and migration of legacy manifest/proposal experiments to the shared
engine. The legacy execution adapters remain available and are not the new normal
interface. Historical reports must remain readable.

Runtime/store/CLI changes so far are bootstrap development by the caller. The
attempted documentation task is the first bounded use of the new runtime for
ArcNexus's own improvement. Its incomplete edits are evidence, not a delivered
self-development result. No source integration, publication or phase-three waiver
has been performed by workers.
