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

`## Operations` summarizes captured operation results with each operation id,
`passed` when its captured `exitCode` is zero and `failed` otherwise, its
`durationMs`, and log path. Absent or empty operation history produces exactly
`No managed operations recorded.` `## Managed services` lists each captured
service id, status, and `endpointClosed` boolean. Absent or empty service history
produces exactly `No managed services recorded.` Both summaries use only captured
record fields and leave the records unchanged.
