# Phase-two workday qualification

The qualification uses Luna/medium, distinct assignment threads, a stable supervising
build outside the candidate, and independently captured acceptance. Simulations exercise
the runtime but do not satisfy the live gate. Source revisions, toolchains and evidence
hashes are recorded with each campaign; no caller implementation repair is permitted.

## Retained failed invocation

`fixture-live-1`, workday `72af52ec-7fce-439d-abdf-d5410df6819d`, used supervisor
`4dc5754059b79e6b7d7c5d8381d120a54a5d8032`. It failed before dispatch: an incomplete
planning result included checklist claims, and the host attempted to update an
unaccepted plan. No candidate implementation was integrated. The built-CLI regression
`planning-updates` reproduces this combination. Proposed claims now remain evidence
until planning completes; they cannot establish acceptance or completion.

Retained campaign:
`/home/adrian/.local/state/arcnexus/qualification/workday-60/fixture-live-1/campaign.json`.
Any later invocation is separate and does not overwrite this failure.
