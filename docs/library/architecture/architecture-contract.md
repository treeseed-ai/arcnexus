# Architecture and assignment contract

Architecture files use YAML, with legacy JSON accepted through the same reader.
Version 4 is described in [component-owned architecture](component-contracts-v4.md).
Versions 1–3 remain supported. Unknown fields, unsupported versions, missing references,
cyclic ancestry, invalid paths and contradictory ownership fail before inference.
Historical reports remain evidence and are not migrated.

Components live in `architecture/components/<id>.yaml`. A platform contains packages;
packages contain foundations, gateways, libraries and releases. Version-four package
identity and roots are inherited by children. Each leaf owns its paths, public modules
and directory exceptions; ordinary file inventories are discovered at the revision.
Patterns reference captured reusable standards, and provided/consumed contracts
identify their accountable owner and exact version. These references add context,
never execution authority. Parent definitions are included completely, root to leaf.

Composition profiles select packages, not ownership parents. `--composition-profile`
selects one for inspection/run; `--execution-profile` selects a declared worker
profile. Selected composition must include the component's owning package.

Roles in `architecture/roles/` describe responsibilities and activities. Execution
profiles in `architecture/execution-profiles/` declare model, reasoning, research,
optional overall/command timeouts and turn limits. Missing limits remain unset. Luna/medium is the default. There is no
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

Every covered tracked file has exactly one leaf owner. Platform coverage exclusions
must explain historical, generated or vendored material. Root-file sandbox exceptions
remain explicit; exact changed-path checks enforce the narrower ownership boundary.

Trusted runtime JSON Schemas live with their implementation owners. Build packaging
generates a local registry; target definitions cannot replace the application's
validators. Validation uses Ajv draft 2020-12 in strict mode without remote loading.
Legacy configuration readers and historical report readers remain available.

Static catalog validation checks each component's default operation/profile
compatibility, declared disposable outputs, and HTTP service dependencies. Assignment
resolution repeats these checks for explicit profile overrides and narrowed operation
sets; an HTTP operation cannot retain a service outside its effective authority.

`validate` reports static catalog validity together with the derived owner index,
effective package repositories and roots, exact write scopes, directory grants and
exceptions, captured file inventories, referenced standards/contracts, and coverage
exclusions. It identifies checks requiring a prepared environment. Legacy write
scope is labeled separately when no component-owned ownership declaration exists.
Discovery roots, like permissions, resolve to repository-relative paths before use.
