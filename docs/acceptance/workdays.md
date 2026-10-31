# Phase-two workday qualification

The qualification uses Luna/medium, distinct assignment threads, a stable supervising
build outside the candidate, and independently captured acceptance. Simulations exercise
the runtime but do not satisfy the live gate. Source revisions, toolchains and evidence
hashes are recorded with each campaign; no caller implementation repair is permitted.

## Successful live proof

Two live cases passed with independent acceptance:

| Case | Workday | Result |
| --- | --- | --- |
| Gateway/identity fixture, invocation 4 | `4aee802a-6195-4e07-bd97-239712e30aad` | Real contract change, separate threads, requester continuation, combined checks passed. |
| ArcNexus guidance/validator, invocation 10 | `377b2f4c-0bb0-40b8-811b-f887baa2eb0d` | Optional references validator, selected skill metadata and maintenance procedure delivered through both owners. |

The ArcNexus workday took 289,221 ms. Guidance used five turns (including one planning
continuation) and 86,359 ms active time; validation used four turns and 194,396 ms.
Both used one implementation attempt, although this manifest explicitly allowed two.
Three declared validator operations supplied feedback. The requester retained thread
`01a193bf-bcdc-7640-8718-ab1042de9214`; the recipient used
`01a193bf-e0c3-7b22-9c6f-881d7a17a849`. Final frozen tests, both owners' checks and
combined acceptance passed. Parking was restored and all managed resources stopped.
No caller implementation fixes or in-run architectural interventions were required.
The exact five candidate files were integrated byte-for-byte in commit `30d6fcb`.
The skill body, name and description remain unchanged; its added reference is tracked
and passes the new application validator. The user-approved top-level `references`
extension is validated by ArcNexus; generic skill-authoring validators with a closed
metadata allowlist do not define this application's metadata contract.

[Machine-readable evidence index](../workday-qualification.json) records all 14 explicit
invocations, including 11 failed and one cancelled invocation, artifact hashes, immutable
supervisor revisions, supplied inputs, thread/turn identities, usage and integration
file hashes. Paths in that index are relative to the private ArcNexus user-state directory.
Qualifying runs are distinct from the earlier failures; this is an end-to-end milestone,
not a claim that every Luna assignment succeeds on its first invocation.

The failures exposed concrete protocol and qualification-input gaps: proposed planning
claims, actual documentation edits, eligible coordination actions, protected directory
grants, host-owned checklist entries, plan consistency and meaningful regression evidence.
Those checks remain enforced. Observed named TAP failures are now used for this assignment,
and bounded correction is explicit rather than an implicit campaign retry.

## Retained failed invocations

`fixture-live-1`, workday `72af52ec-7fce-439d-abdf-d5410df6819d`, used supervisor
`4dc5754059b79e6b7d7c5d8381d120a54a5d8032`. It failed before dispatch: an incomplete
planning result included checklist claims, and the host attempted to update an
unaccepted plan. No candidate implementation was integrated. The built-CLI regression
`planning-updates` reproduces this combination. Proposed claims now remain evidence
until planning completes; they cannot establish acceptance or completion.

Retained campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/fixture-live-1/campaign.json`.
Any later invocation is separate and does not overwrite this failure.

`fixture-live-2`, workday `83b60d44-590d-4fc4-a35f-55f74d823b6e`, used supervisor
`23f1901f78cc5a564d94160a69eccc621d2541cb`. Identity completed its verified change;
the gateway resumed its original thread and preserved its test changes. The host then
rejected its incomplete specification because its own documentation was unchanged.
The explicit source-change requirement is now included in the actual specification
prompt. The checkpoint remains mandatory; no planning repair or caller code fix was
introduced. Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/fixture-live-2/campaign.json`.

`fixture-live-3`, workday `dc029af9-8ecc-40bb-a1f5-e9a82ad404f0`, used supervisor
`4b0dcc1540b57a18ff84dc2ced9b9bb4c9b1b1f1`. Gateway documentation and tests changed,
but the model paraphrased an assertion diagnostic (`Expected: "Identity: Ada"`)
that did not occur literally in the real output. The host rejected the expected-red
claim before implementation. The fixture assignment now names stable assertion
messages explicitly; host matching is unchanged. Campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/fixture-live-3/campaign.json`.

The first real guidance invocation, `guidance-live-1` / workday
`55f1a6de-9875-4d2a-988e-849df452b84f`, stopped after the validator prepared its
regression. It emitted an unsolicited coordination `answer` during specification,
although no clarification was pending. The host rejected it and no implementation
was integrated. The SDK output schema is now narrowed to currently eligible actions,
with an independent host check; observations remain findings/activity evidence.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-1/campaign.json`.

`guidance-live-2`, workday `94132a56-72f8-40c6-ac4f-bf85fbbde959`, used the narrowed
schema supervisor `79a9976de3d978fd11510ad1d35368a186184539`. It correctly avoided
unsolicited coordination. Direct sandbox test output was generic, and the steward
returned that generic diagnostic rather than the named assertion. The host observed
the real `GUIDANCE_REFERENCES_REQUIRED` assertion and rejected the mismatched claim.
The next invocation explicitly binds Node/npm and supplies declared host build/test
operations. The policy and expected-red requirement remain unchanged; no candidate
implementation was repaired by the caller. Campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-2/campaign.json`.

`guidance-live-3`, workday `68c58b9f-b45a-458e-a747-22b0a640daf3`, pinned
`3a882a2c885cc741c3b917d0d15083e985d4128f` with explicit Node/npm bindings and declared
operations. The validator delivered an independently accepted implementation. The
requester resumed but described documentation edits without making them; the host
correctly stopped with `no_changes`. A dedicated documentation-only built-CLI
regression now requires the prompt to request actual file edits. No part of this
failed combined candidate was integrated. Campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-3/campaign.json`.

`guidance-live-4` was deliberately cancelled after an inference-free capability probe
showed that the installed Codex `0.163.0-alpha.10.2` protects `.agents` under a
whole-worktree write grant. Cancellation restored parked changes and retained evidence.
The probe used `codex sandbox --permission-profile arcnexus`, generated filesystem
configuration, Node 22.22.1, and an isolated `CODEX_HOME`. Writing a fixture skill failed
with `EROFS` for `writeDirectories: ["."]`; it passed with the explicitly declared
`[".", ".agents/skills"]` policy. This is a catalog correction, not a sandbox bypass.
The [Codex security documentation](https://learn.chatgpt.com/docs/agent-approvals-security)
describes protected agent directories. The guidance definition must declare its skill
directory explicitly, and inspection must preserve that declaration.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-4/campaign.json`.

`guidance-live-5`, workday `a2261237-8129-403b-85e7-51e0c33a81e5`, successfully
implemented both owners' files with the explicit skill-directory grant. Its final
review result then tried to complete the host-owned `final-verification` checklist
entry; the host rejected that unauthorized checklist update. No candidate changes
were integrated. The model-facing final-result schema now advertises only captured
steward item IDs; independent host validation remains unchanged. Campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-5/campaign.json`.

`guidance-live-6`, workday `32b0bda9-5c28-4810-8a4d-fc290975d64a`, stopped in the
recipient's planning turn: an item used `research`, but the selected activities omitted
research. The host rejected the inconsistent plan before implementation. The planning
prompt now explicitly requires that cross-reference, and the diagnostic identifies the
item and omitted activity. The rule remains mandatory; there is no planning-repair loop.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-6/campaign.json`.

`guidance-live-7`, workday `b33435f2-aaa1-4646-a0f5-34352517ae59`, failed its frozen
regression. The original regression expected rejection of a valid tracked reference;
the steward changed that test during implementation. The retained original still
failed, so no delivery occurred. The assignment now identifies the negative fixture
explicitly: `references: []` must return exit 1, while the old checker returns 0.
A readable regular reference may contain binary data; UTF-8 is not required by the
approved references contract. Review found the candidate imposed that extra restriction,
so independent acceptance now includes a tracked binary file. These are clearer case
inputs and added coverage, not permission to reset frozen tests or repair a candidate.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-7/campaign.json`.

`guidance-live-8`, workday `d63b7775-e26a-48a6-94fd-89cbaf026f79`, passed independent
policy acceptance, including binary files. The validator's review identified a real
test gap: candidate symlink tests could reject untracked paths without exercising
symlink detection. With one implementation attempt, the host stopped rather than
waiving the review finding. The next manifest explicitly opts both owners into at most
two attempts, allowing one bounded repair and review under the unchanged active-time
budgets. CLI defaults remain one attempt. The validator objective also calls for
tracked symlink fixtures. No caller implementation fixes were made.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-8/campaign.json`.

`guidance-live-9`, workday `f0c0d76a-bc80-44ad-819d-3ec17a098596`, stopped at expected-red
validation. The model put the marker in a later diagnostic assertion, while the first
exit-status assertion failed without it. This repeats the diagnostic-mismatch class
seen in fixture-live-3 and guidance-live-2. Instead of retrying that custom assertion
message approach, qualification now uses a named TAP test and captures its actual
`not ok ...` line from operation feedback. The negative fixture remains an empty
references array, and production diagnostics retain their existing file-oriented code.
Host literal matching and independent final acceptance remain mandatory and unchanged.
Campaign: `/home/adrian/.local/state/arcnexus/qualification/workday-60/guidance-live-9/campaign.json`.
