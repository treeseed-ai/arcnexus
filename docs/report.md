# Execution report

The CLI retains machine-readable `report.json` and readable `report.md` outside the
candidate workspace. Markdown identifies the execution, objective, status, workspace,
base revision, failure when applicable, and command count, and points to evidence.
JSON includes observed changed paths and Git change kinds. The first self-development
assignment will expose those existing changes in Markdown as a sorted Changed files
section; that behavior is not present yet.
