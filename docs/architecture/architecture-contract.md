# Architecture and assignment contract

This is the increment-one contract delivered for #30. See [workflow checkpoints](../assignment/steward-workflow.md) for the next execution increment.
Composed dependency workspaces follow separately.

Architecture files use YAML, with legacy JSON accepted through the same reader.
Version 1 and version 2 contracts remain supported. Built-in JSON Schemas are strict,
versioned, and resolved locally. Unknown fields, unsupported versions, missing
references, cyclic ancestry, invalid paths and contradictory ownership fail before
inference. Historical reports remain evidence and are not migrated.

Components live in `architecture/components/<id>.yaml`. Each declares its type,
purpose, repository identity, path, objectives, constraints, questions, patterns,
interfaces, documentation, tests, related components, exact writable scope,
directory access policy, verification, role and execution profile. A platform owns
packages; packages own gateways, libraries and foundations. Parent definitions are
included completely, root to leaf. Related definitions add context, never authority.
Parents constrain their descendants; cross-repository package ownership is explicit.
Composition profiles select packages, not ownership parents. `--composition-profile`
selects one for inspection/run; `--execution-profile` selects a declared worker
profile. Selected composition must include the component's owning package.

Roles in `architecture/roles/` describe responsibilities and activities. Execution
profiles in `architecture/execution-profiles/` declare model, reasoning, research,
overall/command timeouts and turn limits. Luna/medium is the default. There is no
automatic model fallback. Environment commands are executable/argument arrays;
they never imply runtime installation or shell interpretation.

## Read-only commands

```
arcnexus validate --project <repository> [--base <ref>]
arcnexus inspect <component-id> "<objective>" --project <repository>
  [--base <ref>] [--kind change|research|review] [--json]
```

Both inspect committed configuration at an immutable base. They create no state,
worktree or model session and do not execute setup. Filesystem existence and sandbox
capability checks happen after preparation and are reported as pending by inspect.
Validation checks the whole catalog, including unused definitions.

`run` and `inspect` also accept `--assignment <file>` instead of the objective.
The versioned assignment declares objective, kind, expected outcome, acceptance
criteria, optional narrowed writable paths, and host checks. A host check names an
absolute executable and argument array; file inputs listed in `artifacts` are
snapshotted with hashes outside candidate control. The caller is responsible for
declaring all acceptance code inputs; mutable external services are not frozen.
These checks are trusted caller input, never instructions sourced from the candidate.
They run after project verification and cannot replace it.

The resolved assignment captures the base, full context, related definitions,
role, execution profile, permissions and verification, with a deterministic SHA-256
digest. Run stores this before setup. Explicit model/timeout overrides are captured.
Issue numbers provide traceability, not an automatically fetched objective.

Assignments can narrow scope but cannot widen component authority. Every exact
write path must be covered by declared write directories. `.` must be explicit.
Research/review use source-read-only execution and can complete without edits;
change assignments follow the [host-checked workflow](../assignment/steward-workflow.md).

## Ownership and compatibility

The CLI gateway and assignment orchestrator share `tests/assignment/steward.test.mjs`;
changes to that shared acceptance surface require caller review. Runtime libraries
retain their existing source locations. Directory sandbox grants may be broader
than exact file scope; post-execution scope checks remain mandatory.

Existing unversioned project definitions must migrate to schema version 1, including
environments, role/profile references, and component ownership fields. Old reports
remain readable, but new runs do not silently accept legacy definitions.

Validation uses [Ajv draft 2020-12](https://ajv.js.org/json-schema.html) in
[strict mode](https://ajv.js.org/strict-mode.html), with no remote schema loading.

Catalog maintenance is checked against the recursive source inventory: every `src/**/*.ts`
module must have exactly one executable component owner. Workspace lifecycle owns
`bindings.ts` and `members.ts` as well as preparation/cleanup. The bounded-context
acceptance test is shared by assignment orchestration and Codex adaptation; changes
to it require caller review. Qualification infrastructure belongs to the CLI package.

Static catalog validation checks each component's default operation/profile
compatibility, declared disposable outputs, and HTTP service dependencies. Assignment
resolution repeats these checks for explicit profile overrides and narrowed operation
sets; an HTTP operation cannot retain a service outside its effective authority.
