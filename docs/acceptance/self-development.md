# First self-development acceptance

On 2026-10-31 ArcNexus used its own verified runtime to implement the sorted
Changed files section in its Markdown report. The caller supplied architectural
intent, reviewed the diff, and handled commits/PR integration; the caller did not
write or modify the candidate report implementation or tests.

Successful execution: `c31724be-d125-450d-b0df-04191a2f84a6`.
Base/supervisor revision: `fb4d012d863ac928b06125c7c9fc6b0acd9e4fe6`.
Thread: `01a18f60-7966-7e61-8431-fa604e6a3361`.
Configuration: Node 22.22.1, Codex SDK 0.166.0, CLI 0.163.0-alpha.10.2,
Astra/medium, workspace-write, approval never, existing ChatGPT login.

The application created its branch/worktree, installed npm dependencies, created
an isolated Python environment with host uv (runtime downloads disabled), and ran
baseline checks. The steward documented intent first, observed failing new tests,
and changed only `docs/report.md`, `src/report.ts`, and
`tests/runtime/report.test.mjs`. It added a built-CLI report acceptance test as
well as ordering, empty-state, escaping and immutability checks.

The host runtime then independently passed TypeScript checking, all 35 product
tests, six Python tests, and validation of ten skills. The supervisor-owned
`node scripts/check-report.mjs <candidate>` also passed. Checksums confirmed every
supervisor JS module and the independent checker stayed unchanged during execution.
Before caller integration edits, both the tracked patch and new test bytes matched
the application's captured evidence exactly.

Evidence remains in the user's state directory under `runs/c31724be-d125-450d-b0df-04191a2f84a6`:
JSON/Markdown report, events, setup/baseline/final command logs, diff/new-file
snapshots, supervisor checksums, and independent acceptance log. Successful candidate
workspace cleanup follows normal integration; the report survives it.

## First attempt and verification boundary

Run `71dc78b7-70b8-44fe-bfa9-40f2d937611e` produced a correct candidate but reported
blocked because nested CLI tests hit EPERM inside the Codex sandbox. Host checks
passed that candidate independently. Its workspace and original blocked record
remain unchanged. The fresh successful run explicitly handed unavailable sandbox
tests to the supervising runtime; no assertions or host verification were relaxed.
[Issue #14](https://github.com/treeseed-ai/arcnexus/issues/14) proposes clarifying
that distinction in shared guidance based on the observed extra-run cost.

## Cleanup evidence correction through the same loop

Final review found cleanup rewrote execution status and timing in existing reports.
Issue #16 records the observed defect and the smallest regression check: compare
JSON/Markdown bytes before and after cleanup. An independent built-CLI check failed
against the old runner before the fix.

ArcNexus execution `43ad1f7a-bd40-4176-990d-dc40964e967a` implemented the correction itself,
from base `3dafcc35fb04a3919a27fdd3a59af8e70b6f6c70` (current staging plus caller-supplied
workspace architecture/contract). Only the four declared workspace-component files
changed during execution. The unchanged supervisor then passed all 39 product tests,
six Python tests, TypeScript checking and ten skill validations. The independent
cleanup checker passed, and supervisor checksums stayed unchanged. No generated
implementation or test was edited by the caller.

Cleanup now writes separate atomic metadata, preserves execution reports byte-for-byte,
and refuses replacement files/directories/symlinks on retry, including legacy cases.
The run directory retains the independent checker, its result, supervisor checksums,
command logs, events and captured diff. This is the first corrective change made
through the newly established self-development loop.
