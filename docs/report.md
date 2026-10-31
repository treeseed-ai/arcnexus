# Execution report

The CLI retains machine-readable `report.json` and readable `report.md` outside the
candidate workspace. Markdown identifies the execution, objective, status, workspace,
base revision, failure when applicable, and command count, and points to evidence.
JSON includes observed changed paths and Git change kinds. Markdown includes a
`## Changed files` section listing each captured path and its Git change kind,
sorted by path in ascending, case-sensitive string order regardless of input order.
Paths are rendered as literal text, including Markdown punctuation, HTML, and line
breaks. Absent or empty changes produce `No changed files observed.`

The report uses only the captured execution record; it does not inspect target
files or mutate the record or its changes array. Existing report fields and JSON
evidence are preserved.
