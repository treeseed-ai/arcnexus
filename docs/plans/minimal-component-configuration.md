# Minimal component configuration — issue 109

Status: accepted implementation intent; not a claim of shipped v5 support.

## Contract

Declare architectural intent and authority once. Derive effective policy, ownership,
file classification, public API facts and execution plans from captured source.
Keep schemaVersion and stable component IDs. Version-five definitions distinguish
containers from executable owners. Required common fields are schemaVersion, id,
type and purpose; packages add parentId and leaves add parentId and owns. Optional
objectives, constraints, questions and patterns contain meaningful intent only.

Packages have one repository-relative root (default `.`) and inherit the primary
repository identity. Leaves resolve owns, reads and api relative to their nearest
package. Leaf definition files are automatically owned; containers have no write
authority. Every maintained tracked file has exactly one owner. No coverage exclusions.

Role/executionProfile/testProfile resolve from the nearest explicit ancestor.
Reads may narrow inherited access; owned paths are always readable. Constraints,
patterns and required operations accumulate without duplication; objectives/questions
remain attached to their declarations. Mandatory ancestor verification cannot be removed.
Platform director/reviewer/default-package/verification-input policy replaces the
split initialization and execution.yaml settings.

Remove authored path, repositoryRoot, access.writeDirectories, ownership wrappers,
directoryExceptions, interfaces, relatedIds, provides, consumes, discovery,
coverageExclusions, inline verification and operationIds. Reject retired/unknown fields.
Historical evidence readers remain; old configuration is not a second execution path.

## Derived catalog

Capture ownership, hashes, policy provenance, classification, public exports/signatures,
re-exports, imports, schema references, consumers and unresolved relationships.
Use TypeScript and existing suite metadata. Markdown/MDX/RST are documentation;
test profiles identify tests, including proposed new paths. Package-only classification
exceptions cannot conflict. Unknown files stay owned but cannot satisfy spec/test gates.
Cache by source/configuration digests and analyzer version without replacing run authority.

API entries are module; module+export; schema; or module+export+schema. Every artifact
belongs to its declaring owner. Validate symbols and schema references. Preserve
compatibility promises in constraints/docs. Enforce actual public symbols across
owner imports; derive consumers instead of authoring another relationship list.

## Shared execution and write safety

Operations maps IDs to preflight/setup/refresh/verify/agent usages. One definition
supplies each command/service/HTTP action. Replace embedded setup, prerequisites,
probes and test preparation commands with references. Shared typed argv context:
owner ID, owned paths, package root, selected test files, test output root. No shell
interpolation. Resolve prerequisites deterministically and reject cycles. Deduplicate
within a checkpoint and rerun after relevant candidate changes. Record captured
operation identity, context, purpose, output, artifacts and interruption. Regression
references use operation identities, while historical indices remain readable.

Agents and managed subprocesses see maintained source read-only. A host edit tool,
bound to the active assignment, validates complete create/update/delete requests
before writing. Require expected content hashes and durable idempotent edit IDs.
Reject traversal, symlinks, unsafe hard links, private runtime paths, stale contents,
wrong-stage and cross-owner edits. Recover incomplete transactions before dispatch.
Candidate authority/test changes never redefine active permissions or acceptance.

Operations may write only declared untracked generated roots and private temporary
storage. Reject overlap with maintained source or private execution state. Format/lint
fixes return checked edits. One confinement adapter must prove installed-runtime
support; failure refuses execution rather than granting broad write access.

## Migration and delivery

`arcnexus config migrate` previews a validated diff and diagnostics; `--write` applies
it to a clean checkout without commits/publication. Preserve IDs and authority, hoist
identical defaults, consolidate semantically equivalent commands, retain exceptional
classification and contract associations, and assign old excluded files an owner.
Ambiguity requires an explicit decision; a second successful invocation changes nothing.
Active ArcNexus definitions, fixtures and campaigns migrate. Historical records remain
unchanged. Existing captured hosts keep their supervisor; old unfinished runs cannot
silently adopt v5 permissions or the edit protocol.

Sequential slices: characterization/contracts; minimal catalog; shared operations;
checked edits/confinement; API catalog/migration; integrated qualification. Architecture
owns catalog/schema/API derivation, operations owns execution/confinement, workspace
owns edit materialization, assignment owns workflow restrictions, testing owns shared
selection, execution-runtime owns durable lifecycle, report owns projections, CLI owns
migration entry points, architecture-maintenance owns project definitions and this plan.
Use declared public boundaries. Bootstrap directly only until stable self-development
can perform a bounded slice.

## Acceptance

Deterministic built-program cases cover minimal definitions, inheritance, anchored
paths, ownership, new-file classification, shared argv resolution, required checks,
public symbols/re-exports/schema links, migration/idempotence and historical reading.
Write-prevention cases exercise shell commands, hooks, tests, services and descendants;
checked edits cover aliases, stale content, stages, retries and crash recovery. Retain
three/five-owner scheduling, dependencies, task/workday coordination and interruption.

Live gates: actual checked-edit feature; dynamically discovered multi-owner task;
inherited/shared-operation workday; unfinished edits across pause/resume/host loss;
unauthorized writes denied before mutation; actual ArcNexus self-development delivery.
Retain real diffs, independent reviews and evidence; controlled fixtures are not live runs.

Run affected inspect/run suites, then the full suite, format:check, lint, check, build,
built validate and guidance validate. Observe 500/30 physical-line limits and documented
classes/methods. Report local, CI and live evidence separately. Record before/after
field and distinct-command counts. Complete through issue-linked staging review/CI;
never weaken frozen acceptance or publish automatically.

## Implementation evidence (in progress)

Issue: [#109](https://github.com/treeseed-ai/arcnexus/issues/109).
The initial catalog implementation accepts minimal v5 definitions, derives package
membership and implicit definition ownership, resolves inherited policies, rejects
retired fields, and classifies existing/proposed files with the same rules.
It is a bootstrap change developed directly; it does not enable v5 engineering execution.

The pre-change architecture suite passed 51/51 cases. After the initial catalog
change, the assembled architecture suite passed 70/70; proposed-file classification
then added two cases, with all 21 focused v5 cases passing. Formatting, lint, type
checking, build, catalog validation and guidance validation passed for the initial
catalog checkpoint. These results are local evidence, not CI or live qualification.

Remaining work includes complete effective-policy provenance and catalog caching,
public symbol/schema/consumer analysis, shared operations and execution wiring,
checked editing and confinement, migration of production configuration and fixtures,
retirement of executable legacy paths, and integrated/live qualification. None of
the six live gates is satisfied by these deterministic catalog tests.

Baseline configuration counts: 21 definitions, 457 top-level fields, 1,104 recursive
object keys, 96 inline command declarations and 11 distinct command/argument pairs.
No before/after reduction is claimed until the real project configuration is migrated.
The installed sandbox probe allowed declared generated output and rejected a source
write with EROFS; this is feasibility evidence, not the required enforcement matrix.

The next bootstrap checkpoint adds shared operation definitions with fixed host argv
inputs and deterministic prerequisite ordering. Checked edit transactions validate the
whole batch, retain before/after images, and recover after actual child-process exits
at journal publication and partial source replacement. The assignment bridge binds
these edits to the active owner, stage and frozen regression evidence. New execution
remains explicitly disabled until all lifecycle paths use the checked runtime.

Twelve focused assembled-program cases pass, including two installed-runtime cases:
source and configuration-home writes are denied, and generated output is allowed;
separate agent and later failing verification invocations retain different artifacts.
The installed runtime is `codex-cli 0.163.0-alpha.10.2`. Its configuration home needs
an explicit read-only grant: merely placing it outside declared writable paths did
not prevent modification. This finding is specific to the tested permissions profile.
The maintained live probe requires `ARCNEXUS_TEST_CODEX`; skipping it is not a pass.
These are enforcement probes, not the six real task/workday acceptance gates.

Shared setup/refresh/test preparation, complete invocation recovery, platform execution
configuration, stable regression operation identities, HTTP verification checkpoints,
and continuation reconciliation still need integration. Mandatory HTTP verification
currently fails explicitly rather than disappearing from the captured check plan.
Migration and removal of old executable configuration have not been delivered.
