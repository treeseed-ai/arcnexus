# Reliable single-steward operations qualification

The four increments are tracked by ArcNexus issues #41, #42, #45 and #48 and PRs
#43, #46, #47 and #49. TreeSeed's operation catalog was integrated to `cordis` in
[Platform PR #875](https://github.com/treeseed-ai/platform/pull/875). ArcNexus uses
`staging`; no production release or multi-steward coordination was introduced.

The [machine-readable evidence index](../operations-qualification.json) records
immutable revisions, assignment/report hashes, runner hashes, outcomes, turns,
usage completeness and resource shutdown. Paths in that index are relative to the
local ArcNexus state directory (normally `~/.local/state/arcnexus`). Full private
reports, raw SDK events, prompts, plan versions, timelines, patches and logs remain
there outside every candidate workspace.

## Live results

All runs used `gpt-6-luna`, medium reasoning, without fallback. The original campaign
is deliberately retained as **failed: four passes, one failure**. After diagnosing
and fixing the host's ambiguous research-turn instructions, a separately invoked
HTTP qualification passed. The successful cases were not automatically retried.

| Case | Workspace/run ID | Evidence |
| --- | --- | --- |
| ArcNexus self-development | `cb82b7e3-5f35-4e0c-bb35-5f5eb3e72444` | Four turns; real expected-red output followed by implementation, independent acceptance and review; 422.8 seconds. |
| Injected corrective repair | `feb0ff0e-dd67-46f4-a92b-26090e3a5730` | Five turns, two implementation attempts; injected heading defect failed unchanged acceptance, Luna repaired source, then verification passed; 651.1 seconds. |
| TreeSeed command | `5149abe5-5f25-4ef1-af9e-a8e0a0d46e1a` | Declared artifact diagnostics operation, bound Node/Bun, two pinned read-only package worktrees, no edits; 50.4 seconds. |
| HTTP failure retained | `33deb528-ddd8-4e49-8086-d4ec655008de` | Luna deferred testing to a nonexistent later turn; host rejected its incomplete checklist. No service started. |
| Prior findings research | `a8212335-df29-456d-9300-fa6e78f372ff` | Selected historical findings captured before preparation, real operation feedback, evidence-backed conclusions and uncertainty, no edits; 147.4 seconds. |
| HTTP after workflow fix | `464f7659-0878-40b1-8711-4b497e06e529` | Two turns; start, HTTP check, bounded logs and stop; host confirmed endpoint closed; 32.0 seconds. |

The first campaign used the fixed supervising build captured at `0c2d68e` and
pre-improvement ArcNexus source at that revision. The targeted HTTP run used the
build at `3fd6147`, including independent finite-command/Codex supervisors and the
clarified turn contract. Each campaign's supervising artifact hash remained unchanged.

Luna's first successful report diff was reviewed and integrated unchanged in commit
`4dac0d6`: `src/report.ts`, `tests/runtime/report.test.mjs`, and `docs/report.md`.
It adds Operations and Managed services summaries using captured JSON evidence.
The supervising executable and independent acceptance scripts were outside its
write scope. No caller implementation fixes were applied to qualifying candidates.

The corrective case is explicitly **fault injection**, not spontaneous defect
recognition. Its external marker records original implementation SHA-256
`e65c14f08658dc3c48a3766486184acdba57531212f3ae141cdc801f22719003`
and injected SHA-256
`6f735c1120aa42724cb5dfb7bb5a6c232c87f7b4a8e7e32e2309a0fe04649bc4`.
Luna restored the original bytes. Independent checks confirm a failed check followed
by a passing unchanged check and a real implementation change after injection.

## Lessons applied before coordination

- Activities and model turns need separate, explicit descriptions. A research turn
  can execute declared tests/services while remaining source-read-only; it is the
  sole execution turn after planning, not a promise of another testing turn.
- Agent checklist completion is a claim. Host-owned acceptance stays pending until
  independent checks pass; a completed response with pending checklist items fails.
- Parent-loss behavior needs an actual hard-kill test. Both finite commands and the
  Codex executable now have separate supervisors; service shutdown already used a
  parent-liveness channel. Incomplete records remain inspectable after interruption.
- Keep focused regression commands alongside full repository verification. Repeating
  an entire suite for frozen-regression checks consumes the same overall budget.
- MCP approval mode and model-facing strict schemas require real compatibility
  checks. Earlier failed runs remain retained separately, including the schema
  probes `fe91f1a2-bba7-42eb-8469-8aead0543b94` and
  `d645f44d-9e81-494d-bc8e-cbb4bdead969`, and bridge approval failure
  `1fccf6cf-cda7-4b86-839e-96c60ef6c950`. Issue #44 tracks the proposed general
  strict-schema check.

Use [the operations guide](../steward-operations.md) to create explicit campaign
inputs. Select a pinned revision before the report improvement when repeating that
assignment. The runtime does not retry campaigns, promote findings into decisions,
commit, publish or activate another steward.

Observable evidence covers supplied context, SDK-exposed messages/events, operations,
checks and filesystem results. It does not expose private model reasoning or measure
the entire effective Codex context, and declared host commands are not OS isolation.
