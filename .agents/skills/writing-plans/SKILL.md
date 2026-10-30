---
name: writing-plans
description: Use when an agreed capability needs a multi-step implementation plan; not for routine edits.
---

# Plan one working slice

Read the accepted charter/design and current repository. Do not re-open settled
questions. Plan only the next demonstrated capability; later phases stay brief.

Use the issue for a short plan, or `docs/plans/<topic>.md` when a durable plan helps.
Include:
- Goal and the user-observable acceptance scenario.
- Affected responsibilities/files and the public boundary that must stay stable.
- A few ordered steps: docs, failing acceptance, minimal implementation, verification,
  and integration. Fold setup into the behavior it enables.
- Relevant failure cases, concrete verification commands once known, and explicit
  exclusions/open decisions. Never invent commands for a nonexistent application.

Specify public contracts precisely where necessary. Leave internal signatures and
function decomposition to implementation unless another component depends on them.
Do not prewrite the implementation or produce a plan larger than the capability.

Default to native sequential execution within existing authorization. No required
execution framework, subagents, or execution-method question. If the user asked only
for planning, deliver the plan and stop before implementation. If implementation is
already authorized, proceed once material architectural questions are resolved.
