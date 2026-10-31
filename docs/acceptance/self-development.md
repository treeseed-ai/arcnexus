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

## Luna worker default through Luna self-development

The architect clarified the intended hierarchy: Astra supervises, Luna performs
bounded component engineering. Issue #20 changes the CLI's ordinary worker default
to `gpt-6-luna`, retaining explicit `--model` overrides. The caller supplied a CLI
component definition, documentation and an independent executable-boundary check.
That check failed the old default and passed the explicit override before work.

The first Luna run, `052acbbf-9e22-497d-aa65-9bf05972c64d`, changed the default but
introduced a test fixture that expected a custom environment variable to survive
the runtime's environment allowlist. Mandatory host verification rejected it.
Its failed record and workspace remain available; no permissions were relaxed.

With focused feedback, fresh Luna run `1a4118d4-020f-4f31-afdf-9cb91eede96a`
completed from base `b80dd0aa032f155360072f1adc41f670774291fe`, using thread
`01a18f77-738d-7662-8f4a-d90f2ac56417`. It embedded the temporary capture path in
the controlled executable and added default/override tests through the real SDK.
Only `src/cli.ts` and `tests/runtime/steward.test.mjs` changed; caller integration
copied those files unchanged. The host passed TypeScript, 41 product tests, six
Python tests and ten skill validations. The independent check passed both report
settings and the exact SDK `--model` argument. Integration also passed the local
build, 41 tests and built CLI help smoke check.

The successful run took 52.0 seconds and reported 115,051 input tokens (92,544 cached)
and 1,584 output tokens. The failed run took 108.4 seconds with 533,667 input tokens
(490,624 cached) and 6,049 output tokens. These are aggregate usage records, not
quota prices. Both used Luna/medium; no Astra inference was needed for this change.
Evidence and the external acceptance script are retained in the run directories.

This demonstrates one Luna self-development change with supervisor feedback; it
also exposes a phase-two need: feed a precise verification failure back to the
responsible worker without repeating the whole investigation. Current phase one
has no resume, so the correction required a fresh assignment/worktree. The planned
Astra supervisor is not yet an implemented application role.

## Index evidence correction (#22)

Luna run `505bc000-efce-4bc2-9792-6287a6aa5e4e` implemented separate staged and
unstaged inspection and evidence. An external built-CLI check failed both masked
out-of-scope staging and in-scope index-only changes before the implementation,
then passed against the candidate. Host verification correctly rejected the run:
its generated test expected an empty unstaged diff after restoring a working file,
but restoring the file creates the reverse index-to-working-tree diff.

The supervising reviewer integrated the implementation unchanged, corrected those
two test expectations, and added a case for a masked staged edit introduced during
final verification. The integrated build passed 45 product tests, TypeScript and
the independent checks. This is assisted self-development with a reviewer test
correction, not a claim that the original autonomous run passed. Its failed record
and candidate remain retained for inspection.
