# Single-steward workflow evidence

Bootstrap implementation for #31 was performed directly to establish host-enforced
checkpoints. Self-development assignments use the resulting stable runner in #32.

## Live research probe, 2026-10-31 UTC

- Runner/source revision: `cd1b02e` (workflow implementation).
- Workspace/run: `da12c973-dfaa-481b-9031-e514196af56f`.
- Thread: `01a19024-dfe4-75c0-9ce3-2723763f0c0f`.
- CLI: `codex-cli 0.163.0-alpha.10.2`; SDK: `0.166.0`.
- Model: `gpt-6-luna`, medium reasoning; read-only source; live hosted search
  available; local network disabled; no approval prompts or delegation.
- Objective: research ownership between architecture resolution and assignment
  execution, cite actual interfaces, and explain the cross-owner handoff.
- Evidence is retained in the application's user-state `runs/<id>/` directory,
  including exact prompt/settings, stream, structured findings, checks and diff.

The model returned findings and made no source edits. It identified the immutable
ResolvedAssignment handoff, but also inferred ownership from `src/assignment.ts`
rather than consistently trusting the component's declared file ownership. This is
not accepted as proof of reliable architectural understanding.

Refinement: explicitly tell the steward that definitions establish ownership, not
module names; include the assignment-execution owner in architecture's related
context. This remains a bounded context selection, not injection of every component.
The repeatable qualification campaign must verify the refined behavior independently.
No caller edits were made inside the research candidate.
