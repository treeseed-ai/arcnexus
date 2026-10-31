# Development journey

This page preserves the planning steps from the final recommendation in the founding
conversation, locally stored in `context/start.md`. That conversation is ignored by
Git; this transcription is tracked so the journey remains available to every developer.
ArcNexus is the Architecture Studio described below.

## Current direction and evidence

Read the [charter](charter.md) for current architectural authority and the
[phase-one retrospective](phase-one-retrospective.md) before designing coordination.
Read the [pre-phase-two qualification](acceptance/pre-phase-two.md) for the current
single-steward gate and preserved live evidence. The [operations qualification](acceptance/steward-operations.md) adds captured plans/checklists, managed operations, parent-loss supervision and selected prior findings, including a retained failed case and its verified workflow fix. Only the next useful slice needs a
detailed implementation plan.

| Phase | Current status and next proof |
| --- | --- |
| 1. Single steward | Delivered: managed workspace/setup, SDK execution, verification, evidence and guarded cleanup. See the [implementation sequence](plans/phase-one.md), [live sample](acceptance/live-sample.md) and [self-development evidence](acceptance/self-development.md). |
| 2. Two stewards | Runtime delivered: bounded requests, verified delivery, partial-change parking and same-thread continuation. Live qualification is in progress; see [workdays](workdays.md) and [retained evidence](acceptance/workdays.md). |
| 3. Minimal UI | Planned: architect selects a component, directs work and reviews evidence through the same runtime. |
| 4. Expanded governance | Planned: deepen inherited patterns, contract validation and conformance checks based on actual use. |
| 5. Multi-project operation | Planned: prove one real package relationship before broad composition and release coordination. |

Later architect decisions refine the historical sequence:

- Application-managed worktrees and environment setup moved into phase one; they
  are already delivered, despite the later worktree introduction in the source.
- Pre-phase-two delivered real schemas/catalogs, observable research/change/review
  workflows, pinned read-only repository dependencies and six Luna qualification cases.
  Two caller specification clarifications and every failed campaign remain recorded.
- Full ancestor context and writable-scope checks also began in phase one. Phase
  four expands governance; architecture has applied from the first assignment.
- Self-development started in phase one, including a corrective change. It does
  not wait for the UI or the completion of the first three milestones.
- The intended model hierarchy is an Astra supervisor directing Luna workers.
  Astra handles high-level reasoning/review; deterministic runtime code owns
  dispatch and evidence. Human architectural guidance remains authoritative.
  Start with two Luna stewards before scaling.
- Use `gpt-6-luna` for subsequent worker live tests. Luna-sized models are the intended
  steward baseline; earlier Astra evidence does not establish Luna readiness.
  The CLI defaults to `gpt-6-luna`; explicit `--model` overrides remain supported. A larger-model fallback requires an explicit decision, not a
  silent retry. Track verified outcomes, execution count, elapsed time and usage.

## Historical planning transcription

The excerpts below reproduce source sections 2–7 and 9–14, including the final
starting point, verbatim apart from trailing blank lines. Section 8's illustrative
source-tree layout and the earlier conceptual discussion are omitted. The numbering,
examples and wording belong to the original proposal. They are not current CLI,
SDK, schema or API reference; use [stewards](stewards.md) and
[workspaces](workspaces.md) for implemented interfaces. SQLite coordination is delivered; Hono/React remain future direction. Current decisions above take precedence where
historical sequencing differs.

<!-- source-planning:milestones:start -->
# 2. Build it in five progressively useful milestones

I would structure development around five milestones, each with a working acceptance test.

Milestone | What you build | What must actually work
--- | --- | ---
**1. Single steward** | Codex execution, component definition, CLI | Give a component an objective; Codex changes code and runs tests
**2. Two stewards** | Structured inbox and execution handoff | One steward requests a contract change; another responds; work continues
**3. Architecture Studio UI** | React interface and Hono API | Select components, direct stewards, run workdays, review results
**4. Architectural governance** | Parent inheritance, patterns, constraints, verification | Stewards consistently follow architecture and deviations are reported
**5. Multi-project operation** | Package composition, profiles, release management | Coordinate engineering work across packages and repositories

I would not start the next milestone until the current milestone works end-to-end.

Importantly, the application should be capable of performing actual engineering work after the very first milestone.

That is the key difference from building an elaborate architecture first and hoping everything eventually comes together.

# 3. Milestone 1: Build one working steward

This is where I would begin.

Create a tiny sample repository containing one library and some tests.

Give it an architectural definition:

```
{
  "id": "identity",
  "type": "library",
  "path": "src/identity",
  "purpose": "Provide identity management capabilities",
  "objectives": [
    "Maintain reliable authentication",
    "Provide a stable public interface"
  ],
  "constraints": [
    "Do not depend on UI code"
  ]
}
```

Then build the simplest possible Codex wrapper.

The CLI should accept something like:

```
studio run identity "Implement session expiration"
```

The runtime should:

- Load the component definition.
- Construct the steward's instructions.
- Start Codex in the repository.
- Give Codex the assignment.
- Collect its result.
- Verify the relevant tests and save a report.

For this milestone, you don't need an inbox, multiple agents, a React application, or even the complete six-stage engineering workflow.

Just a single agent performing a real engineering task under architectural direction.

### The runtime should initially look something like this

```
async function executeAssignment(assignment) {
  const component = loadComponent(assignment.componentId);
  const context = buildContext(component, assignment);
  const result = await executeCodex(context);

  return recordResult(assignment, result);
}
```

Each function has exactly one responsibility.

The interesting work happens inside those functions, but each should remain small and understandable.

For example:

```
function buildContext(component, assignment) {
  return {
    architecture: loadArchitecture(component),
    role: getStewardRole(component.type),
    objective: assignment.objective,
    constraints: component.constraints
  };
}
```

Here, loadArchitecture() can eventually incorporate the entire parent hierarchy without changing the assignment execution logic.

This is the style I would use throughout the application.

Not necessarily short functions for their own sake, but **functions that perform one coherent task and delegate genuinely separate responsibilities**.

Avoid replacing a single readable 30-line function with fifteen trivial wrappers. That produces indirection rather than simplicity.

### Definition of success

You should be able to give a component an objective, have Codex implement it, verify that the tests pass, and inspect the resulting Git diff.

The result must be based on actual test execution and filesystem changes, not merely Codex reporting that it completed the work.

Until that works repeatedly, I would build nothing else.

# 4. Milestone 2: Add the inbox and second steward

Now introduce a second component.

I would use exactly the example we discussed previously:

```
Sample Package
    |
    +-- API Gateway
    |      |
    |      +-- Interface Designer
    |
    +-- Identity Library
           |
           +-- Systems Engineer
```

The gateway consumes an identity contract provided by the library.

Give the gateway steward an objective requiring an interface change.

Now introduce the inbox.

### Keep the data model minimal

I would use five SQLite tables:

Table | Stores
--- | ---
workdays | Workday identity, status, start/end information
assignments | Objectives, ownership, plans, status, dependencies
messages | Structured requests and responses
executions | Codex thread IDs, execution results, usage, duration
events | Workday logs and significant actions

Architectural definitions remain in JSON files, so you don't need tables for every architectural component.

You also don't need a separate persistent agent registry.

**A steward's identity is its component ID.**

### The execution loop

This is what I would aim for:

```
async function runWorkday(workdayId) {
  while (hasRemainingCapacity(workdayId)) {
    const assignment = nextReadyAssignment(workdayId);

    if (!assignment) break;

    const result = await executeAssignment(assignment);

    processResult(assignment, result);
  }

  return finishWorkday(workdayId);
}
```

processResult() does three things:

- Records the execution outcome and updated plan.
- Validates and delivers outgoing inbox messages.
- Updates assignment readiness and dependencies.

These operations should be persisted atomically where appropriate.

That's essentially the whole orchestrator.

Notice what doesn't exist:

There is no agent scheduler powered by an LLM.

There is no separate inbox-monitoring agent.

There is no autonomous conversation manager.

The deterministic runtime simply selects the next ready assignment.

### Keep the agent result structured

I would require Codex to return something resembling:

```
{
  "status": "needs_response",
  "summary": "Identity contract requires extension",
  "plan": [
    "Define contract",
    "Implement endpoint",
    "Verify integration"
  ],
  "requests": [
    {
      "to": "identity",
      "subject": "Add session expiration capability",
      "requested_change": "Extend the identity contract"
    }
  ]
}
```

The runtime validates the response and creates inbox records.

For an initial prototype, there is no need for custom communication tools. The Codex SDK supports schema-constrained final responses.

The steward finishes its execution whenever it needs a response from another component.

The runtime then activates the recipient.

When a response arrives, the originating assignment becomes eligible again.

I would set a maximum number of exchanges so the system cannot get trapped in endless negotiation.

### Definition of success

Two specialized stewards coordinate a contract change, perform the required implementation, and produce passing tests.

Neither agent independently abandons its objective or assumes that the other will complete work outside its ownership.

The runtime tracks outstanding dependencies.

This is your first genuinely architecture-driven multi-agent engineering system.

# 5. Milestone 3: Add the smallest possible React application

This is where I would be particularly disciplined.

I would initially build **one screen**, not the three complete architectural pages we previously discussed.

The first UI could look like this:

```
┌──────────────────────────────────────────────────────────────┐
│ Architecture Studio                         [Run Workday]     │
├────────────────┬─────────────────────────────────────────────┤
│                │                                             │
│ ARCHITECTURE   │ Identity Library                            │
│                │                                             │
│ Sample Package │ Purpose                                     │
│                │ Provide identity management                 │
│   API Gateway  │                                             │
│                │ Objectives                                  │
│   Identity     │ • Reliable authentication                   │
│                │ • Stable public interface                   │
│                │                                             │
│                │ Constraints                                 │
│                │ • No UI dependencies                        │
│                │                                             │
│                │ STEWARD                                     │
│                │                                             │
│                │ Current assignment: None                    │
│                │ Inbox: 0                                    │
│                │                                             │
│                │ [ Direct Steward ]                          │
│                │                                             │
├────────────────┴─────────────────────────────────────────────┤
│ WORKDAY                                                     │
│                                                             │
│ Status: Complete                                            │
│ Executions: 3 | Tests: Passed | Requests: 2                │
│                                                             │
│ [ View Report ]                                             │
└─────────────────────────────────────────────────────────────┘
```

That's enough.

You can inspect the architecture.

You can direct the steward.

You can run a workday.

You can inspect the result.

The rest can wait.

### React implementation

I would keep the initial React application to four conceptual components:

Component | Responsibility
--- | ---
App | Selected component and application state
ComponentList | Display architectural hierarchy
ComponentInspector | Display and edit selected component
WorkdayPanel | Start workdays and display progress/results

Use ordinary React state, fetch(), and a small amount of CSS.

No Redux, Zustand, elaborate data-fetching architecture, or component framework unless you already have one installed that genuinely reduces work.

### The Hono API

I would initially expose only these operations:

Endpoint | Purpose
--- | ---
GET /api/components | Retrieve the architecture
POST /api/assignments | Direct a steward
POST /api/workdays | Start a workday
GET /api/workdays/:id | Read workday status and report
GET /api/workdays/:id/events | Read execution progress

Component editing can be added with a simple update endpoint when you need it.

The CLI and UI should call the same underlying runtime functions.

**Do not create separate execution implementations for CLI and API operations.**

That's an easy source of architectural drift.

### Keep background processing simple

You mentioned the background agent architecture specifically.

I would initially use one Node.js server process containing both Hono and the workday runner.

When the UI starts a workday:

- The API creates its record in SQLite.
- It starts an asynchronous workday operation.
- It immediately returns the workday ID.
- The React application polls the status endpoint.
- The runtime records execution events and the final report.

No separate worker service is necessary yet.

This assumes a persistent Node.js process; it is not intended for an environment where the server can be suspended between requests.

For reliability, record active work before executing Codex. If the server restarts, mark interrupted executions for inspection or explicit resumption rather than silently assuming they succeeded.

I would use polling initially—perhaps every second or two while a workday is active.

WebSockets and streaming infrastructure are unnecessary until polling becomes a real limitation.

### Definition of success

You open the application, select a component, provide an engineering objective, run a workday, and watch it complete.

You can then inspect the report, tests, generated changes, and any coordination messages.

At this point, **you have the core product working**.

Everything afterward is an improvement to that capability.

# 6. Milestone 4: Make the architecture authoritative

Only after the working agent system and UI exist would I expand the architectural model.

This is where you add the inheritance mechanism we discussed.

For example:

```
Platform
   |
   +-- Profile
         |
         +-- Package
               |
               +-- Foundation
               |
               +-- Gateway
               |
               +-- Library
               |
               +-- Release
```

Each component inherits its applicable parent architectural information.

Every steward receives the complete architectural definitions of its ancestor components.

I would implement that through one recursive traversal function.

Something conceptually like:

```
function getArchitectureContext(component) {
  const parents = getAncestors(component);
  return [...parents, component];
}
```

This is simple and reusable.

It also means that changing a package constraint automatically changes the architectural context of all its component stewards.

You should not need to rewrite any agent prompts.

### Add reusable patterns

Patterns can initially be JSON files in a shared directory.

For example:

```
architecture/
    components/
        platform.json
        package.json
        identity.json
        api.json

    patterns/
        hono-api.json
        library-testing.json
        service-contract.json
```

A component references the patterns it uses.

The runtime includes the applicable pattern definitions in its context.

Later, patterns can contain templates, tests, and validation rules.

But the initial implementation should only need references and descriptions.

### Add architectural verification

Start with checks that are inexpensive and deterministic:

- Are component directories present?
- Are required contracts defined?
- Do changed files fall within permitted component boundaries?
- Are forbidden dependencies present?
- Do required tests pass?

This should be a small validation module.

Don't attempt to build an AI-powered architecture auditor immediately.

You can introduce semantic analysis when the deterministic checks prove insufficient.

### Definition of success

Changing a platform-level constraint affects how a library steward approaches subsequent assignments.

The system also detects a straightforward architectural violation rather than accepting it merely because tests pass.

This is the milestone where the studio starts addressing the architectural drift that has been causing you problems.

# 7. Milestone 5: Expand to real multi-project development

Once the previous milestones work, you can add packages from your actual projects.

I would introduce them one at a time.

For each new package, define its purpose, foundation, dependencies, gateways, and major libraries.

Attach steward roles.

Run a small assignment.

Verify the result.

Then add another package.

This is where you gradually introduce the remaining steward specializations.

The foundation architect and release engineer don't need separate runtime implementations. They only need their component definitions, role instructions, execution capabilities, and validation rules.

Similarly, a CLI gateway and an API gateway can use the same interface-designer role with different execution profiles.

At this point, I would introduce Git worktree isolation for real development assignments and explicit integration review for changes spanning repositories.

I would also expand release coordination to track agreed contract versions, implementation readiness, and actual artifact availability.

But none of those capabilities should require fundamentally changing the execution loop.

**If adding another architectural component requires substantial new orchestration code, something has probably become too specialized.**
<!-- source-planning:milestones:end -->

<!-- source-planning:principles:start -->
# 9. Establish development rules for the AI building this application

This may be more important than the specific technology choices.

I would give the initial Codex agent a small set of strict engineering instructions.

Rule | Reason
--- | ---
**One working feature at a time** | Prevents incomplete subsystems from accumulating
**No speculative abstractions** | Prevents unnecessary complexity
**Prefer existing functions and modules** | Encourages reuse
**One coherent responsibility per function** | Keeps implementation readable
**No placeholder implementations** | Ensures the system actually works
**No unnecessary dependencies** | Reduces maintenance and integration problems
**Every change must pass relevant tests** | Prevents regressions
**Do not expand scope without approval** | Protects architectural direction

The placeholder rule deserves particular emphasis.

AI agents frequently generate applications containing extensive scaffolding, mocked services, simulated results, TODO comments, and interfaces for capabilities that do not yet exist.

The result looks substantial but often accomplishes surprisingly little.

For this project, I would require **real implementations and real tests for every completed milestone**.

If something isn't implemented, it should be explicitly identified as not implemented.

I would also require agents to run the application after meaningful changes instead of treating successful compilation as proof that the system works.

Compilation is necessary, but it does not establish that the intended behavior functions correctly.

## Keep tests focused on the highest-risk boundaries

Initially, I would prioritize three kinds of automated tests.

**Execution tests:** Verify that an assignment is passed to the appropriate steward and its result is recorded correctly.

**Coordination tests:** Verify that requests, responses, blocked assignments, and execution handoffs behave correctly.

**Application tests:** Verify that the UI can submit an assignment, start a workday, and retrieve the resulting report.

Most orchestration tests should use predetermined agent results so they are fast and deterministic.

Then include at least one real Codex end-to-end test that exercises the complete engineering workflow.

This keeps your test suite inexpensive while still validating the actual integration.

# 10. Make every milestone a complete vertical slice

I want to emphasize this because it is the development principle I would be most strict about.

Suppose you're adding the inbox.

A conventional approach might involve:

- Building a complete messaging data model.
- Implementing an inbox service.
- Adding message routing.
- Creating notification infrastructure.
- Writing a UI for messages.
- Integrating agents.
- Testing the complete system.

That is exactly how projects become difficult to finish.

Instead, I would build the inbox around **one specific behavior**:

The API steward needs the identity steward to approve a contract extension.

Implement only enough to make that behavior work.

Then make a second behavior work:

The identity steward requests clarification, and the original steward responds.

Then a third:

The identity steward accepts the contract, implements the change, and unblocks the API steward.

Each step should produce a functioning result.

You don't need the general-purpose inbox system first.

You build the smallest useful inbox behavior and generalize only after discovering what the different behaviors actually share.

This also produces better abstractions because they're based on observed requirements rather than anticipated requirements.

# 11. Set limits on how much the agents can do

Since you're trying to stop projects from drifting, I would introduce a few safeguards from the beginning.

Every workday should have a maximum number of agent executions.

Every contract negotiation should have a maximum number of exchanges.

Every assignment should have one accountable owner.

Every agent should operate within a known component scope.

Every completed engineering change should have verifiable results.

And every workday should produce a final report, even if it fails or is interrupted.

For code modifications, the runtime should inspect the actual Git diff against the component's permitted scope. Prompts alone are not sufficient to enforce file boundaries.

If the agent needs to modify another component, it should request that change rather than modifying it silently.

These restrictions make the system easier to predict and debug.

I would also default to **one active workday with one Codex execution at a time** for the prototype.

This is a deliberate tradeoff.

You sacrifice some potential throughput in exchange for straightforward ownership, reproducibility, and much simpler debugging.

Once your coordination mechanism is proven reliable, independent assignments can be parallelized.

# 12. What I would deliberately leave unfinished

One of the hardest parts of building this application will be resisting attractive features.

I would explicitly defer the following:

Feature | Why it can wait
--- | ---
AI decision model | Direct ownership-based routing is sufficient initially
Multi-model orchestration | One Codex configuration is enough to validate the architecture
Thousands of steward identities | Start with two
Dynamic agent configuration | Inherit a small number of shared roles
Full visual architecture diagrams | Component hierarchy is enough initially
Comprehensive architectural language | Simple JSON definitions are enough initially
Cross-repository release coordination | Prove single-repository coordination first
Automated production deployments | Begin with verified local changes
Distributed execution workers | One Node.js process is enough initially
Sophisticated long-term memory | Component definitions and assignment history are enough initially

None of these features is inherently bad.

They're simply not necessary to demonstrate the core hypothesis.

And the core hypothesis is the only thing that should matter until it has been demonstrated.

# 13. The development process should become self-reinforcing

This is where I think your idea becomes particularly valuable.

Once you finish the first three milestones, you can begin developing the Architecture Studio through its own steward system.

For example, you might define these components:

```
Architecture Studio
    |
    +-- Runtime Package
    |     |
    |     +-- Architecture Library
    |     +-- Context Library
    |     +-- Inbox Library
    |     +-- Workday Library
    |     +-- Codex Gateway
    |
    +-- API Package
    |     |
    |     +-- Hono Gateway
    |
    +-- UI Package
          |
          +-- React Gateway
```

Initially, these are merely component definitions associated with parts of the actual codebase.

But now each has a steward.

You could select the Inbox Library in the UI and issue the objective:

"Add support for declining contract-change requests with a reason."

Its steward receives the assignment.

It reads the inherited architectural context.

It modifies the implementation.

It runs its tests.

It records the result.

You inspect the change.

The application has just been used to maintain itself.

At that point, you have demonstrated something much more important than a sophisticated architecture editor.

You have demonstrated that **architectural intent can directly guide autonomous engineering work**.

And as you introduce more components, the system becomes progressively better able to maintain its own implementation.

I would make this your first major project milestone.

Not a feature-complete Architecture Studio.

Not a fully automated engineering organization.

**An Architecture Studio that can reliably implement a small improvement to itself.**

That is a concrete, meaningful success criterion.

# 14. One final recommendation: Keep the architecture smaller than the implementation

I think this is the most important discipline for you to maintain over the long term.

Your architectural model is supposed to reduce cognitive load.

That only works if it describes the decisions you care about, not every implementation detail.

For example, you might define one Workday library with a clear purpose and explicit constraints.

That library could contain ten functions or a hundred functions.

The architect shouldn't care unless those implementation choices violate a defined responsibility or constraint.

Similarly, a React Gateway might eventually contain dozens of UI components.

You don't need an independent architectural steward for every React component.

You need a steward responsible for the gateway's interface and architectural coherence.

If parts of the UI become sufficiently independent to justify separate responsibilities, you can introduce new architectural libraries later.

**Do not force the architectural hierarchy to mirror the source-file hierarchy.**

The architecture should remain relatively stable while the code evolves.

That is how it can provide meaningful direction rather than constantly chasing implementation details.

## The exact starting point I would choose

I would start with this:

**Experiment: Architecture Studio v0.1**

One repository containing a small TypeScript library, a component definition, a Codex execution wrapper, and a CLI command.

The first real objective would be:

"Add a small feature to the library, document it, write tests, implement it, and verify the result."

Once that works, introduce the second steward and contract-change inbox.

Once that works, create the simple React interface.

Then use the application to make its next improvement.

I would treat each of those as a separate, working release rather than asking one AI agent to implement the entire application.

And I'd keep one operating rule throughout development:

**Every development iteration must leave the application working, with a demonstrated new capability. Complexity must be justified by a real requirement, not an imagined future need.**

For your situation, I would prioritize *reliably completing small engineering tasks* above every other feature.

If the first version can take one architectural objective, activate one steward, produce a tested code change, and report exactly what happened, it has already accomplished the fundamental purpose of the system.

Everything after that should make this simple process more capable—not more complicated.
<!-- source-planning:principles:end -->
