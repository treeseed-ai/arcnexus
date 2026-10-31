# Integrated experiment qualification

Issue #53 replaces campaign generation with declarative data and a TypeScript runner.
The [evidence index](../experiment-qualification.json) records hashes and paths
relative to the retained ArcNexus user-state directory. Historical campaigns and
failures remain unchanged. The guidance-steward demonstration is recorded separately
in [agent guidance acceptance](agent-guidance.md).

## Live campaign

One explicit invocation of `experiment run experiments/operations.json --mode live`
with local bindings passed all five cases. The supervisor was copied outside the
candidate repositories from `ad414c3224c8875535c9984f1c4693bc3d7c1871`; its hash was
captured before launch and matched before subsequent cases and at completion.
All ten snapshotted artifacts still matched their captured hashes afterward.

| Case | Result | Turns | Attempts | Elapsed |
| --- | --- | ---: | ---: | ---: |
| Report change | Ready for integration | 4 | 1 | 431.0 s |
| Injected report repair | Ready for integration | 5 | 2 | 624.9 s |
| TreeSeed declared operation | Research completed | 2 | 0 | 50.3 s |
| Local HTTP service | Research completed | 2 | 0 | 30.3 s |
| Selected-prior-evidence research | Research completed | 2 | 0 | 163.3 s |

Every case used Luna/medium, completed its checklist and independent campaign check,
and recorded complete available usage with no caller implementation interventions.
Each retained its original assignment budget. No campaign retries or model escalation
occurred. Raw SDK usage and context evidence remain in the individual reports.

The fault-injection case is deliberately labeled: the external harness changed the
Operations heading after initial implementation, recorded the before/after hashes,
and failed with `FAULT_INJECTED`. Luna edited the actual implementation on its one
corrective turn. The unchanged independent check passed afterward and confirmed that
the final source differed from the injected bytes. This proves corrective editing,
not spontaneous discovery of an unknown defect.

Both report candidates were reviewed and touched only their declared implementation,
test and documentation files. They replay the already-delivered feature from its
pinned pre-improvement revision; they are retained as qualification evidence rather
than integrated again over the newer reporting implementation.

TreeSeed used its pinned platform revision and two read-only package worktrees:
CLI `89fb78b6fd362a8de9dec9d238a310f65545175b` and SDK
`4c0ecd2a0fc28545dbf677cc988ce69f0cf2f15d`. It made no source changes. The HTTP case
used the declared health operation and recorded its service stopped with
`endpointClosed: true`. Research compared selected historical evidence with current
focused tests, distinguished those tests from broader host verification, and made
no source changes. ArcNexus and TreeSeed source checkouts remained clean.

## Deterministic and integration checks

All 178 Node tests, TypeScript checking/build, guidance validation, architecture
validation and assembled CLI smoke checks passed. Tests cover the public experiment
commands and production SDK/launcher/bridge, fixed success/repair/boundary/failure
scenarios, immutable acceptance, changed supervisors, cancellation, parent death,
and the legacy campaign entry point. Scripted evidence is labeled simulation and
cannot satisfy the live gate. PR #55 carries actual CI and the integration review.

One initial full-suite run detected a supervising build changed by an overlapping
local rebuild. The integrity guard correctly invalidated that experiment. A fresh
full-suite run with the build held fixed passed all 178 tests. Live qualification
used its separate frozen build throughout.

ArcNexus CI and normal environment setup no longer require Python or uv. An existing
optional manual sandbox diagnostic (`scripts/check-permissions.mjs`) still invokes
Python; historical pinned target environments also retain their original toolchains.
The application and new tooling implementation are TypeScript.
