# Execution report

The CLI retains machine-readable `report.json` and readable `report.md` outside the
candidate workspace. Markdown identifies the execution, objective, status, workspace,
base revision, failure when applicable, and command count, and points to evidence.
JSON includes observed changed paths and Git change kinds. Markdown includes a
`## Changed files` section listing each captured path and its Git change kind,
sorted by path in ascending, case-sensitive string order regardless of input order.
Paths are rendered as literal text, including Markdown punctuation, HTML, and line
breaks. Absent or empty changes produce `No changed files observed.`

Markdown also includes `## Outcome` with the captured workflow outcome and
`## Activities` with each captured activity/status pair. These sections use only
fields already present in the execution record; records without workflow fields
render safely without `undefined` or `null` text. The report does not inspect
target files or mutate the record or its arrays. Existing report fields, changed
file ordering, and JSON evidence are preserved.

`## Initialization` presents captured initialization evidence as readable labeled
lines: component, model, routing outcome, summary, selected owners with their
reasons, and outstanding questions. Missing historical initialization values say
`unavailable`. This summary uses only the execution record and does not replace
the JSON evidence. The following `## Execution progress` section continues to
show stage, current command, checklist, last verified progress, warnings,
cancellation, and configured limits.

`## Operations` summarizes captured operation results with each operation id,
`passed` when its captured `exitCode` is zero and `failed` otherwise, its
`durationMs`, and log path. Absent or empty operation history produces exactly
`No managed operations recorded.` `## Managed services` lists each captured
service id, status, and `endpointClosed` boolean. Absent or empty service history
produces exactly `No managed services recorded.` Both summaries use only captured
record fields and leave the records unchanged.

`## Captured test selection` lists the mandatory test suites captured in each
component definition under `resolvedAssignment.context`. Each entry shows the
captured component id, source path, test level, and SHA-256, sorted by source path
in ascending, case-sensitive string order. Rendering reads only the captured
assignment context and does not inspect test files or reorder the captured arrays.
When historical records have no captured test selection, the section says
`unavailable`. An explicitly captured empty suite list says `No tests captured.`

## General execution projections

The execution report JSON at `report` is a projection of one durable run. `run.id`
identifies that task or workday run; `run.mode` is `task` or `workday`, and the
summary also carries its objective, status, creation time, and selected evidence
fields. `assignments` is the run's separate work list. Each assignment has its own
`id`, `owner`, objective, status, dependencies and evidence. An owner can therefore
have multiple assignments in one run; count assignments, not distinct owners.

`counts.ready` and `counts.waiting` count assignments in those exact statuses.
`counts.verified` counts assignments whose status is `completed`, after owner
delivery verification. They are queue and delivery counts, not goal-completion
proof. In task execution, the host assesses the assembled candidate against the
whole objective after all assignments are completed; the run becomes `completed`
only when that assessment supplies `goalEvidence`. A completed worker turn or its
checklist is a worker claim, not independent verification. Verified owner delivery
is separate from both that claim and whole-goal completion.

`run.data.candidateRevision` identifies the candidate revision retained with the
run. `run.data.candidateLocation` is the captured candidate workspace path when
available. These fields identify a candidate; the path alone does not prove its
contents remain unchanged or integrated. Owner verification evidence is retained
as `verifiedEvidence`; whole-goal evidence is separately retained as `goalEvidence`.
A retained candidate is ready for caller review/integration, not already integrated:
the caller owns integrating it into the source checkout.

Detailed current-run `report.json` evidence records the run identity and mode,
ordered events and requests, source observations, and per-assignment identity,
status, milestones, delivered revision, verification and matching execution-record
observations. A worker's completion summary is not substituted for these host
observations. When historical records lack these newer fields, report them as
unavailable. Do not infer success from missing evidence or rebuild historical
evidence by reading mutable target files; preserve historical report readability.

Configured limits shown by legacy execution-progress reports are observations, not
proof that general task/workday execution enforces them. The general execution
interface does not accept work budgets; obsolete budget settings are rejected.
Optional legacy execution-profile limits remain unset unless explicitly selected.
This does not waive cancellation, process supervision, output limits, permissions,
or independent host checks.

General execution remains in qualification. The qualification record retains live
workday, lifecycle and self-development evidence, while the three-owner task gate
and remaining migration work still prevent phase-three readiness. Deterministic
tests do not substitute for the outstanding live demonstration.
Implementation references for these projections are `src/library/report/execution-report.ts`
and `src/library/report/execution-evidence.ts`; assignment and run fields are defined
in `src/library/coordination-store/execution-types.ts`. Captured report checks are
`report-format`, `report-lint`, and `report-tests` in the report component definition;
`tests/library/execution-runtime/acceptance/verification-coverage.test.ts` covers
separate owner and whole-goal verification. The qualification status is recorded in
`docs/plans/general-agent-execution-qualification.md`.

## Coordination evidence

Reports summarize planned/actual/corrective turns, implementation attempts, elapsed
time, captured usage and its completeness/accounting basis. Supplied prompt bytes
and provenance references describe host-supplied context, not complete effective
Codex context. Host command results and independent acceptance remain distinct from
agent findings, uncertainty, boundary requests and caller interventions. Missing
historical fields say unavailable; they are not interpreted as zero or none.

For report assignments, obtain `report-format` feedback before interpreting
`report-lint` size results. Neither operation changes files. Captured verification
checks formatting and lint before expensive repository tests; the focused report
regression remains verification command 2. A formatting failure must be repaired
within report scope, not hidden by compressing expressions onto fewer lines.
