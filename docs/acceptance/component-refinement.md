# Component refinement qualification (#71–#73)

The three increments make component definitions authoritative, align implementation
boundaries with ownership, and expose shared verification through the application.
They preserve TreeSeed as a legacy-layout target and retain historical inputs.

## Delivered surfaces

- **#71 / PR #74:** version-four ownership, package repository inheritance,
  referenced standards, provided/consumed contracts, packaged local schema registry,
  and revision-bound file discovery. Legacy versions remain supported.
- **#72 / PR #75:** gateway/library layout, foundation/release/testing ownership,
  command-family adapters, generated compatibility executable, and shared component
  test inspection/execution with literal metadata and captured selections.
- **#73 / PR #76:** documented class/method responsibilities, declaration spacing,
  syntax-based lint with strict TypeScript retained, and development/staging/production
  verification through one pinned, read-only reusable workflow. Production checks do
  not publish or deploy. No default runtime deadlines or quotas were added.

The test-count progression is 287 before this work, 299 after #71, 322 after #72,
327 after readability/workflow acceptance, and 333 after diagnostic regressions.
The useful live change adds one report regression, producing 334 tests. Existing
scenarios were preserved; splitting fixture support and clarifying comments did not
remove coverage. The subsequent 43 comment-only files preserve identical parsed
executable code relative to the live starting revision.

## Live assignment and independent authority

The `report` owner adds **Captured test selection** to Markdown reports. It renders
captured component, test source, level and hash in source order without reading
mutable files or changing the record. Missing historical selection is unavailable;
an explicitly empty selection says no tests were captured.

The successful invocation is pinned to
`0c3ac3149f3b30a7cbdcd7b0a43242344e64f7d5`, using an immutable supervising build
outside the candidate. Its scope is limited to `src/library/report`,
`tests/library/report`, and `docs/library/report`. It receives the
`readable-typescript` standard, `test-profile` and `candidate-changes` contracts,
discovered inventories, and three captured report suites.

Luna/medium performs initialization and the steward workflow. One retained steward
thread performs planning, specification, implementation and read-only review. The
host requires the declared expected-red failure, frozen regression, repository
verification and an unchanged external acceptance executable. No caller changes
were made to the live candidate. The accepted diff changes only report source,
its unit suite and report documentation.

Scoped `report-tests`, `report-format` and `report-lint` operations provide real
feedback. The initial lint failure was repaired within the implementation turn;
no extra implementation attempt was needed. Agent checklist completion remains
separate from the host-owned final verification entry. No service was requested.

## Preserved invocations

All paths below are relative to
`$XDG_STATE_HOME/arcnexus/qualification/component-refinement-73`, normally
`~/.local/state/arcnexus/qualification/component-refinement-73`.
The [evidence index](component-refinement.json) records revisions, usage, hashes,
operations, checks, authority and report references.

| State directory | Run | Result |
| --- | --- | --- |
| `live` | `cbfd97f8-1b83-4c43-a2dc-0580f90e7021` | Deliberately cancelled after a host-check defect and unhelpful corrective excerpt; partial work retained |
| `live-02` | `ef1d27e9-c17c-44ce-b8df-98b828123ca5` | Failed baseline before inference; repeated-failure identity regression detected |
| `live-03` | `827e9524-2c2b-4aa0-a7ab-bd0c9661ce5c` | Verified change ready for caller integration |

The first run exposed empty Codex protection directories beneath a granted catalog
directory. The catalog test now reads regular definition files, with a deterministic
reproduction. Its long test log also exposed feedback that omitted the actual late
failure. Shared bounded excerpts now retain diagnostic context and the full log
reference. The second run caught that changing log filenames must not change the
loop fingerprint; evidence references now remain outside diagnostic identity.
These fixes were committed between explicit invocations. Neither failed run was
resumed, overwritten, or relabeled as successful. The independent acceptance was
unchanged across all three invocations. Broader verification-order policy remains
an explicit follow-up in #77 rather than silently changing every owner.

## Verification and integration

The successful candidate passed the full 334-test suite before review and again
at final verification, with frozen tests and independent acceptance passing both
times. Runtime CI [41285165421](https://github.com/treeseed-ai/arcnexus/actions/runs/41285165421)
passed 333 tests at the pinned pre-improvement revision. Final-head development CI
and actual staging verification are recorded on PR #76 and issue #73.

Deterministic acceptance includes the two-owner contract handoff through the
production SDK/launcher/bridge path; it is not labeled as paid live inference.
TreeSeed validated and its `artifact-diagnostics` assignment was inspected with
its declared repository bindings at `20cb9a0034d3c813f78e8d824ea813c7537c3538`.
Its checkout remained unchanged.

Original reports remain byte-for-byte retained. A separate candidate-rendered
preview may demonstrate the new report section; it does not replace the report
written by the immutable supervising build. Source checkouts and candidate branches
remain caller-owned, and no main release, publication, container deployment or
React implementation was performed.
