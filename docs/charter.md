# ArcNexus charter

ArcNexus is the Architecture Studio described in the founding conversation.
This charter records the direction confirmed by the human architect. It defines
intent, not a claim that the capabilities below already exist.

## Purpose

Help a human architect direct software development through a small, understandable
architectural model. Components define responsibilities; stewards maintain them;
contracts coordinate work; tests and observed results establish what was achieved.

ArcNexus is itself a target platform. Its first major success is implementing a
small improvement to its own code through its own steward runtime, under human
architectural direction. Use that loop to develop subsequent capabilities as soon
as it is reliable. Direct bootstrap development supplies only what that loop needs.

## Objectives and evidence

1. **Useful immediately:** the first phase accepts an objective for one component,
   executes real engineering work, runs verification, and exposes the actual diff
   and report through a CLI.
2. **Accountable coordination:** any number of existing package stewards execute
   sequentially through durable assignments, inboxes and dynamic dependencies.
   Support self-directed workdays and director-led tasks, with one accountable owner
   per assignment. The [general execution contract](library/execution-runtime/execution.md)
   and its live qualification gates must be satisfied before phase three.
3. **Architect-directed operation:** a small UI lets the architect select a
   component, direct its steward, run a workday, and inspect evidence.
4. **Self-development:** use ArcNexus to make a real improvement to ArcNexus; retain
   the objective, architectural context, execution record, diff, and test results.
   A manually edited change or simulated agent result does not satisfy this objective.
5. **Controlled evolution:** incrementally enforce architectural boundaries and
   expand to multiple packages and repositories without replacing the execution loop.

Measure completed objectives, verified changes, failures, blocked work, executions,
coordination exchanges, time, and available usage data. Record unavailable measures
as unavailable. Message volume and generated code volume are not progress metrics.

## Architectural vocabulary

Keep the model small: platform, profiles, packages, foundations, dependencies,
gateways, releases/environments, and libraries. Documentation and tests attach to
relevant responsibilities. Architecture need not mirror directories or individual
functions. Add concepts only when a real behavior cannot be represented clearly.

Each component needs a stable identity, purpose, location/scope, lasting objectives,
constraints, open questions, and applicable reusable patterns. Include contracts
and relationships when needed. A steward's role and execution configuration can
be inherited rather than copied into bespoke prompts.

Component definition, persistent stewardship identity, temporary execution,
assignment, and assignment plan have distinct lifetimes. Every execution receives
its own definition and the full applicable parent architectural definitions, plus
relevant contracts and work history. Unrelated implementation and old conversations
are not automatic context.

## Constraints

- One useful vertical slice at a time; finish and demonstrate it before adding the
  next capability. Plan only the current slice in detail.
- Preserve human architectural authority. A steward proposes changes beyond its
  boundary; it cannot rewrite the approved architecture to excuse a deviation.
- Use one shared deterministic execution path behind eventual CLI, API, UI, and MCP
  gateways. AI performs engineering; ordinary code schedules and records work.
- Start with one active workday and one execution at a time. Stewards are dormant
  definitions between executions, not processes that converse or put themselves to sleep.
- Keep one accountable owner per assignment and one authoritative owner per contract.
  Delegating a dependency does not complete the original assignment.
- Separate contract acceptance, implementation readiness, and release availability.
  Resume dependent work at the milestone it actually requires.
- Govern execution by observed progress and cancellation, without work budgets;
  record failed, interrupted, and blocked outcomes. A workday must end with an honest report, including partial results.
- Verify actual changed paths and executed tests. Prompts and agent claims alone
  cannot enforce scope or prove success. Development success does not authorize production.
- Use concise functions with coherent responsibilities, simple modules, and existing
  tools. Introduce abstractions and dependencies in response to demonstrated needs.
- No placeholder implementations or simulated outcomes presented as working features.
  Deterministic test doubles are useful for tests but cannot prove real harness integration.
- Keep the architectural specification smaller and more stable than the implementation.

## Initial technical direction

The founding conversation recommends TypeScript, an existing Codex execution harness,
component definitions (now authored in YAML with legacy JSON compatibility), SQLite
when coordination persistence is needed, and later
Hono plus React/Vite. Use one repository and a small backend process. Verify the
current harness interface and authentication during phase-one planning; historical
API examples and model names in the conversation are not verified current contracts.

Do not introduce the UI, database, inbox, all steward roles, provider framework,
distributed workers, sophisticated routing model, or multi-project release machinery
before the current slice needs them. Basic applicable architectural context and scope
remain relevant from the first execution; phase four expands governance rather than
postponing all architectural guidance until then.

## Reusable patterns

- **Direct steward:** select responsibility → give objective → execute → inspect evidence.
- **Small vertical slice:** specify new/changed observable behavior → failing
  acceptance test → implement → run assembled artifact → review → integrate.
  Refactors preserve an existing contract and prove behavior before and after.
- **Shared execution:** gateways call the same application functions.
- **Structured handoff:** return a validated result/request; runtime persists state,
  routes work, and resumes assignments. Informational logs do not activate agents.
- **Inherited context:** combine shared role, parent definitions, component, assignment,
  and execution rules; retrieve other information only as needed.
- **Evidence-backed completion:** independently inspect changes and verification,
  retaining unresolved dependencies and limits in the report.
- **Self-development loop:** use a verified working ArcNexus revision to improve
  the next; a tested local/staging revision qualifies without a published release.
  Retain the stable supervising runner and a recovery path when the candidate fails.
  Candidate changes to instructions or tests cannot retroactively redefine the
  active assignment's authority or accepted behavior.

Patterns start as short guidance. Extract reusable templates from successful use;
do not build a pattern framework in advance.

## Questions to resolve at the relevant phase

These are open decisions, not hidden prerequisites for a complete platform design.

Phase-one target, harness, result-contract and stable-supervisor questions are
resolved in the [retrospective](phase-one-retrospective.md), with linked acceptance
evidence. Luna-sized models are the intended steward baseline; use `gpt-6-luna`
for worker live tests and assess their results separately from earlier Astra runs.
The architect specifies **an Astra supervisor directing Luna stewards**: reserve
Astra for high-level decomposition, architectural reasoning and review; use Luna
for bounded component engineering. Human architectural authority remains final.
Deterministic runtime code still schedules, bounds and records execution. Prove
the arrangement with two Luna workers before scaling the number of stewards.

- Phase two uses a verified change in the shared candidate as its delivery milestone.
  Durable checkpoints support explicit pause/resume and validated recovery.
  Uncertain operations are never replayed automatically. Historical two-owner
  workdays remain inspectable but cannot resume under the new scheduler.
- Later: which architectural decisions may stewards accept themselves, and which
  require the human or an explicitly authorized parent steward?

## Sequence, not a large implementation plan

1. Single steward and real CLI engineering result.
2. General agent execution, persistent workdays and director-led tasks; live qualification.
3. Minimal architecture/direct-steward/workday UI.
4. Expanded inheritance, reusable patterns, and conformance checks.
5. Multi-project composition and release coordination.

Begin self-development as early as the working runtime permits; the first three
phases should establish the practical loop. Each phase can contain smaller working
releases. Full platform completeness is never a prerequisite for using ArcNexus.

## Source and status

Derived from the founding conversation in `context/start.md` and the architect's
explicit direction that ArcNexus should ultimately develop itself. The context
folder is local and ignored by Git; this tracked charter must stand on its own.
The conversation remains historical rationale. Later explicit architectural
decisions should update this charter rather than require readers to reconstruct chat.
