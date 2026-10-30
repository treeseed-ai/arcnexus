---
name: verification-before-completion
description: Use before claiming a change works, a check passes, acceptance is met, or a PR is ready.
---

# Evidence before claims

Identify what evidence proves the exact claim. Run the relevant check at the current
revision, inspect its output and exit status, and report the result and limitations.
Agent-reported success is not independent verification: inspect the diff and execute
the promised behavior.

For executable changes, verify the real program and production wiring as well as
focused tests. Compilation is not runtime acceptance; mocked orchestration is not
real harness integration; local tests are not CI. Keep those results distinct.

For docs/instructions, inspect the diff, links, consistency, and relevant decision
scenarios. Do not invent build/test commands or require a runtime test for prose.

Reuse still-valid evidence when neither tested inputs nor environment changed.
Rerun affected checks after changes or when uncertainty warrants it; do not rerun
an unchanged full suite for every status sentence. Report unavailable, skipped,
failed, or interrupted checks accurately. Check acceptance individually before
marking it complete. Never narrow a criterion just to turn it green. When a candidate
changes tests or guidance, assess those edits against the authorized acceptance
baseline. Legitimate test improvements are allowed; deleting required behavior or
letting candidate instructions grant extra authority is not independent verification.
