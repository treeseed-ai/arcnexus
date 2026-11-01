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
| `510b877` | Full declared suite, `/tmp/arcnexus-78-full-suite-v5.log` | 356 passed, zero failures; retained test-run `6c5fb74a-eb73-487e-93ab-e49dabfa87e2` |

The built execution-runtime suite passed at `eb79ba7` (28 tests), recorded in
`/tmp/arcnexus-78-runtime-v9.log`, with retained test-run
`dabfce4b-f834-40a0-a1b5-fe62fc928636`. This includes director goal correction,
pinned policy workspaces, plan correction, and process-level host-loss recovery.
Controlled harnesses establish these deterministic results, not live qualification.
The runner-capture acceptance first failed against `eb79ba7`, then passed with the
new capture implementation: replacing a disposable installation no longer changes
the background host or its managed helpers. Evidence is in
`/tmp/arcnexus-78-runner-{red,green}.log`.

GitHub Development CI passed for `55ebc20a7eefceb14fafbb0f9501b2f65fdcc474`,
run `41328257426`. This supersedes the earlier CI failure caused by nonportable
catalog-test instrumentation. Changes after that revision still need CI validation.

At `869bf63`, the full declared suite passed all 380 tests with no failures:
`/tmp/arcnexus-78-full-suite-v13.log`, retained test-run
`5895a1a4-a7c6-4028-8619-0cd775bec2f3`. The execution-runtime subset passed
39 tests in `/tmp/arcnexus-78-runtime-v12-final.log`, retained test-run
`396d62c1-b4b5-41df-80a9-d140e6021fef`. These include indexed independent
criterion coverage, inbox conversation retention, and active-wait cycle semantics.
Formatting, lint and strict typing passed in `/tmp/arcnexus-78-*-v13.log`;
ownership and guidance passed in the v12 validation logs. The first v12 preflight
correctly rejected a missing schema `$id`; the committed correction was validated
before the successful runtime and full-suite runs.

The preceding full run at `518711f` passed 371 of 372 tests. Its only failure was
the new host-loss test's startup watchdog, before the deliberate kill. Startup now
has a separate test watchdog; the post-kill shutdown observation is unchanged.
Evidence: `/tmp/arcnexus-78-full-suite-v11.log`. GitHub Development CI independently
passed at `518711fb3790dde6eb2afeea8c415314bdfa7dc7`, run `41330960402`.
Changes after that revision still need CI validation.

Ownership and guidance validation passed at `510b877`. Build, strict type checking,
formatting and lint have local evidence in `/tmp/arcnexus-78-*-v5.log` and
`/tmp/arcnexus-78-request-*.log`. These local checks do not establish CI or live
qualification. Final-revision checks must be refreshed after further changes.

At `1f577a0`, all 46 execution-runtime acceptance tests passed, including
host-captured verification artifacts and rejection of arbitrary artifact paths:
`/tmp/arcnexus-91-runtime.log`, retained test-run
`b65f8e08-88a3-45c8-9efa-ab58be7f0c54`. The three new evidence scenarios first
failed against the preceding build. Formatting, lint, strict types, ownership and
guidance checks passed in the issue-91 logs. An initial overlapping test preparation
removed the build during guidance validation; that invocation failed and was rerun
successfully after preparation. It is not counted as a passing validation.

At `74dd383`, policy and engineering recovery passed 12 focused scenarios in
`/tmp/arcnexus-92-green.log`; three unfinished policy-role regressions first failed.
At `1ddc2e5`, all four blocked-continuation tests passed in
`/tmp/arcnexus-78-cycle-controlled-final.log`, including a worker-produced cycle,
director diagnosis and verified delivery by the same retained three assignments.
These are controlled harness tests, not live model evidence.

At `751923b`, idle wakeup, inbox and scheduler coverage passed 18 tests in
`/tmp/arcnexus-93-green.log`; the idle request scenario first failed while manual
pause/stop preservation already passed. Strict typing and scoped lint passed after
correcting declaration spacing. The next full suite passed 393/395 tests in
`/tmp/arcnexus-78-full-suite-v15.log`, retained run
`6d3660a0-e4eb-4d16-87c2-cefdd7fcb18e`. Both failures were inspection subprocess
capture errors: `spawnSync` returned `ENOBUFS`, SIGTERM and null status for output
just above 1 MiB. Identical commands succeeded with complete 16 MiB capture. Issue
96 retains exact byte counts and commands; its two focused regressions passed in
`/tmp/arcnexus-96-green.log` after changing only the test capture buffer and error
diagnostics. That failed full suite is not counted as a pass.
GitHub Development CI passed at `869bf63b78305adb8d3e0864db79424d3d360bd7`,
run `41332836654`; subsequent changes still need CI.

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
| v5 | `510b877` | Baseline passed. Real steward returned correctly scoped workday/report requests requiring delivery, but legacy validation rejected its completed turn status before scheduling the yield. Issue 83 records the defect. No delivery claimed. |
| v6 | `20438d0` | Real workday no-work reasoning was rejected by an overstrict selected-owner check (issue 84). A separate task's incomplete initial plan was rejected without a correction activation (issue 85). Both defects now have failing-then-passing regressions; these attempts delivered no verified changes. |
| v7 | `e733913` | Cancelled with retained partial work after diagnosing unavailable independent scope evidence in the captured supervisor. A real workday reached a no-work result, then safely paused for task `6252baab-b1d9-46b4-a634-8b9514f73c7e`. Task-intake dynamically requested workday and report deliveries. Both dynamically requested owners reached verification. The workday owner entered correction after two interruption tests missed startup markers during captured acceptance; issue 90 retains that failure. Independent review subsequently caught inaccurate recovery wording and missing access to complete changed-file evidence (issue 91). Delivery was withheld and correction continued. No completed delivery is claimed. |

The v7 workday is `68ad1913-a73e-4b00-810a-d8cdc4401112`. Its task-pause
projection is retained in `live-workday-v7-during-task.json`; task progress is in
`live-task-v7.log`. The stable supervisor and clean source are `supervisor-v7` and
`source-v7`. An earlier v7 start from the development checkout was stopped before
engineering and retained separately; it is excluded from this demonstration.

v4 task: `70d5d427-2dcc-4e6d-8659-3b176c297a2f`.
Its task-intake record is `59692f1c-e30d-4b9c-9eaf-5b29939fea0c`.
Inspect raw reports under `runs/<record>/report.json`, task projections under
`projects/<project>/reports/<task>.json`, and `live-task*.log` for observed CLI
progress. Worker claims, host checks and independent review are separate evidence.

A second live campaign now exercises the current runner in a separate, committed
three-owner greeting package. Evidence is under `general-live-v1`, task
`c16f68a9-d3aa-4b42-b5a0-f5b9f27afde2`, captured source
`855fd8f13ec2e5ca45c3c9dbd89f7816062454f2`, supervising implementation `751923b`.
`invocation.json` retains the exact ordinary task command and role profiles;
`prompt.txt` requires a real opt-in shout feature through CLI → service → names,
with all three owners making actual documentation, regression and implementation
changes. It uses the real Codex executable, Astra direction/review and Luna
engineering. This is not the controlled simulation executable. It reached `needs_input` after a real CLI specification turn made documentation
and failing-regression edits but reported a checklist item complete before its
prerequisite. The host withheld completion; issue 94 records the missing safe
correction path and ambiguous legacy coordination instructions. The director then
asked for checkpoint facts already retained by the host; issue 95 records that
evidence-projection gap. No delivery or qualification pass is claimed. The host captured its runner
before the next development build.

The v7 cancellation is retained in `live-v7-cancellation.json`. The workday was
stopped, then SIGINT was sent to the attached task CLI. It exited 130; the task
became cancelled, the host reported no active execution, and all five observed
managed processes stopped within approximately 0.2 seconds. Patches for all three
partial assignments are retained as `cancelled-v7-<record-id>.patch`, with hashes
and workspace references in the cancellation evidence. No partial patch was
promoted or imported. This establishes the observed live cancellation subcase,
not the complete host-interruption/recovery gate.

Issues 94 and 95 now have failing-then-passing built-program regressions. Seven
focused tests passed in `/tmp/arcnexus-94-95-green-final.log`, including rejection
of unfinished model transport as a safe checklist correction. Formatting, lint,
strict typing, ownership and guidance checks passed before the new live attempts.
The corrected implementation is `5021ca5` (checklist correction `c658971`, director
checkpoint projection `2b3e911`, inspection capture `5021ca5`).

The next real greeting task is `47f5c154-d9ba-4001-9e03-b342b714b6f5`, with its
exact prompt and output in `general-live-v1/prompt-v2.txt` and `task-v2.log`. It
creates fresh assignments and explicitly treats its prior unsafe task as retained
historical evidence. ArcNexus self-development v8 uses clean detached `source-v8`
at `5021ca5`; `live-v8-invocation.json`, `live-workday-v8-start.json` and
`live-task-v8.log` retain its ordinary CLI invocations and progress. Both use the
application's immutable supervising-runner capture. Neither produced a verified delivery. The greeting task reached all three owners,
then required input after a forbidden release-activity claim and an unsafe blocked
checkpoint (issues 97 and 98). ArcNexus v8 failed its captured baseline tests before
engineering; its original reports and baseline remain retained.

The integrated deterministic run at `5021ca5` completed **394/400**, with evidence
in `/tmp/arcnexus-78-full-suite-v16.log` and retained test run
`f06e06f5-56d1-4e45-a229-91ce9f06d922`. The inspection-buffer failures are resolved.
Six other cases failed: two simulation campaign assertions, campaign startup before
cancellation, two workday startup markers, and a verification-timeout stage assertion.
The concurrent captured-source baseline also failed simulation and startup cases.
Issue 99 tracks diagnosis; no integrated pass is claimed.

For qualification interruption tests, distinguish process exit/preparation failure
from a missing readiness marker and retain the actual diagnostic. Startup watchdogs
bound test execution only; they must allow the intended boundary to be reached before
measuring cancellation or host-loss behavior. Timeout-specific tests must establish
which operation actually timed out. Campaign assertions must include retained case
errors rather than discard those errors behind a list of failed statuses. Keep the
existing behavioral acceptance and child-stop checks intact while correcting these
observation gaps.

Issues 97 and 98 now pass **12/12** focused built-program tests in
`/tmp/arcnexus-97-98-green-final.log`, including role-authority rejection, unsafe
transport rejection, real blocked-response continuation and accepted-versus-delivered
context. Issue 99 passes **8/8** focused tests in `/tmp/arcnexus-99-green.log`.
The retained standalone campaign at
`/tmp/arcnexus-78-experiment-diagnosis-UpJ3PZ/campaign` produced the expected three
passes and deliberately failing case; its focused success does not replace the
failed integrated run.

The real workday `d57830f1-e9e7-4290-84d4-75dc914ae131` considered four owners, then
required attention because a read-only activation treated the valid future write
directory `tests/library/change-inspection` as a required existing read path. Issue
100 fixes that conversion while retaining path validation. Its permission and
production policy tests pass **9/9** in `/tmp/arcnexus-100-green.log`. Strict typing and formatting passed; full lint, ownership and guidance validation
passed after the follow-up method-length correction. The next integrated run is
`/tmp/arcnexus-78-full-suite-v17.log`, built at `47047ed`; its result is pending.

Real greeting attempt three is task `d163a69d-1fcf-4747-a394-1cbf9a73d868`, started
with supervisor `1be0ff6` and retained in `general-live-v1/task-v3.log`,
`prompt-v3.txt` and `invocation-v3.json`. It again discovered all three owners and
is still executing. Earlier unfinished changes were not imported. No verified
qualification gate is claimed from this attempt yet.

The next integrated run completed **408/409** at `47047ed`, retained in
`/tmp/arcnexus-78-full-suite-v17.log` and test run
`46b3f507-bca1-4fe1-99da-7cbf21c65de5`. Its sole failure was another inspection
capture exceeding Node's default buffer: `ENOBUFS`, status null, 1,049,861 stdout
bytes. The identical CLI exited zero with a 16 MiB capture. The corrected test
passed in `/tmp/arcnexus-96-final-inspection.log`; no full integrated pass is
claimed yet.

Version-3 prompt campaigns now exercise ordinary task execution, automatic package
checks and independent verification. Completion, dirty-source rejection and
cancellation pass **3/3** built-CLI scenarios in
`/tmp/arcnexus-78-campaign-cycle-green.log`. The general multi-owner fixtures moved
to the testing library; their CLI/artifact behavior passed **4/4** in
`/tmp/arcnexus-78-shared-fixtures-green.log`. Legacy scenarios and adapters still
need migration; this new path does not by itself complete slice five.

Real greeting attempt three delivered the names owner's actual implementation,
documentation and regression, with independent verification retained. Service's
actual behavior and scope also passed its independent checks, but verification
honestly retained a gap for request-before-consumption chronology. The task ended
`needs_input`; its verified names delivery and unfinished service/CLI work remain
retained. Issue 101 now supplies pinned current-run host chronology, provenance and
source observations through the verifier artifact capability. Its **6/6** focused
checks, including foreign-record rejection, passed in
`/tmp/arcnexus-101-green-final.log`.

New live task `8047b349-3034-4bac-95bb-cc59dc675ef6` runs in `general-live-v4`, a
fresh canonical repository at the original greeting source revision. New live
workday `c9b356cb-981f-4d19-bd3b-85f1c3eb57ce` runs in `workday-live-v1`, with a
committed CLI objective that whitespace-only input use the existing default
through owned normalization. Both use supervisor `52354e4`, captured by the
application before subsequent builds. Their invocation files retain exact ordinary
commands, source revisions and machine bindings. Both are running; their live gates
remain pending.

## Integrated checks and live lifecycle evidence

The integrated run at `9e14ff0` passed **415/415** tests in 521 seconds, retained
as `b0bafbff-d4bc-44c4-a866-fbfb4c1c4365` and
`/tmp/arcnexus-78-full-suite-v18.log`. Formatting, lint, type checking, build,
ownership and guidance validation also passed in the corresponding `v18` logs.
This does not qualify later changes or substitute for live evidence.

Live workday `c9b356cb-981f-4d19-bd3b-85f1c3eb57ce` reached `paused` with unfinished
plans, regression snapshots, thread IDs and waiting dependencies retained, then
resumed. Evidence is `workday-live-v1/paused-status.json`, `paused-evidence.json`,
`pause-output.txt` and `resume-output.txt` under the qualification root. An external
documentation task `cad6ace3-9680-4cd1-b7f4-612fd7a20b4c` then paused the workday,
completed with owner verification and goal assessment, and returned control to it.
Its actual `cli/USAGE.md` diff is retained in candidate
`aa876419dc1f73faa7416fac99d3f944c9f92bf1`; the source checkout stayed clean.
`after-task-status.json` records the resumed workday and completed task. This is a
successful real mode-coordination case, not proof of every race or failure path.

Live host loss was injected during task `8047b349-3034-4bac-95bb-cc59dc675ef6`:
SIGKILL stopped all four observed managed descendants within 0.11 seconds. Restart
through ordinary `workday status` retained the task as `interrupted` and dispatched
nothing. Evidence is `general-live-v4/host-loss.json`, `before-host-loss.json` and
`host-recovery-status.json`. The names delivery remains verified; unfinished
service/CLI changes remain retained and unpromoted. This proves prompt subprocess
termination and honest interruption, not safe replay of the interrupted operation.

Issue #102 exposes retained SDK tool observations and host command output to the
independent verifier. Its eight focused tests pass in
`/tmp/arcnexus-102-green-final.log`; missing, partial and foreign observations stay
explicit gaps. Live v4 also exposed repeated review gaps with changing prose (#103).
The original acceptance and frozen regressions have not been weakened to bypass it.

A bounded ArcNexus documentation improvement is running from clean source `9e14ff0`
in `source-v9`, using the stable captured supervisor `52354e4`. Its exact prompt,
command and revisions are in `live-v9-invocation.json`; no delivered result is claimed.

## Latest verified deliveries and qualification status

The integrated suite at `f2a6d41` passed **419/419**, with static checks, build,
ownership and guidance validation passing (`/tmp/arcnexus-78-*-v19.log`). GitHub
Development run `41344690704` also passed at that revision. Later changes require
fresh integrated verification.

Live workday `c9b356cb-981f-4d19-bd3b-85f1c3eb57ce` delivered the names improvement
with an inbox request: assignment `a1e689a2-ecf6-452f-a133-74c7c97402cb`, independent
review `b996f76c-3eca-470a-a361-d71bf3884e05`, candidate
`2d82698c8009459ce6ac98e12dd5e7595019e9fa`. Its actual whitespace normalization
change, owner tests and direct CLI assertions are retained in `workday-live-v1`.
`safe-recovery-verification.json` also records same-run continuation after host loss
at a safe paused checkpoint. Normal stop then reached stopped with no active work.

A second live workday `344ab01e-1386-4cf4-ab4f-841614f862cf` reached idle after
verified CLI documentation and service/names inbox deliveries. One unrelated
assignment failed; four completed. Evidence in `workday-live-v2` includes
`idle-report.json`, `verified-usage.patch`, candidate test results and `stop.json`.
This demonstrates successful work and failure isolation, not universal success.

ArcNexus self-development task `4581fa39-75aa-480a-b0bb-95ae5c441180` completed.
Worker `e20c95d5-539d-44da-aa8e-b0910631e667` changed only
`docs/library/report/report.md`; every captured baseline and final host command
passed. Owner verifier `d1b3a3db-7524-4310-8054-f6f868f53cdd` accepted all ten criteria;
goal assessment `5403cc63-1109-4c2a-a522-bdbaf8abc399` accepted all eleven criteria.
The stable supervisor was `52354e4`, source authority `9e14ff0`. The exact diff and
assessment references are retained as `live-v9-verified.patch` and
`live-v9-integration-evidence.json`. Caller integration is commit `285c741`; workers
did not integrate, publish or change the source checkout.

Live gates 2–6 now have demonstrations: self-directed verified work plus inbox,
unfinished work across pause/resume, task/workday coordination, cancellation and
host-loss recovery, and independently verified ArcNexus self-improvement. Their
individual evidence above does not replace the deterministic race/crash matrix.
Gate 1 remains open: a complete verified three-owner prompt with a dynamically
discovered owner. V5 exposed missing readable supplier assessments (#104); V6
exposed completed expected-regression mismatch handling (#105). Neither failed
attempt is counted as a completed task, and original criteria remain unchanged.

## Remaining qualification and implementation work

Phase three remains blocked. Complete the three-owner live task, qualify the latest
recovery/evidence changes, rerun integrated checks, and migrate legacy manifest and
proposal experiments to the shared engine before removing their execution adapters.
Historical report readers and useful validation/test/evidence commands remain.

Runtime/store/CLI changes remain bootstrap work by the caller. The independently
verified report-guide improvement is the first delivered self-development result.
Subsequent documentation status corrections are caller edits, distinguished from
the retained exact runtime delivery.
