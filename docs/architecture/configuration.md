# Configuration documents

Pre-phase-three increment 1 delivered YAML configuration with legacy JSON support
under issue #63; historical execution evidence
remains JSON and is never migrated in place.

Components, roles, execution and composition profiles, environment declarations,
operations, assignments, workdays, bindings and experiments share one reader.
YAML documents contain only JSON-compatible values and string mapping keys.
Duplicate keys, aliases, custom tags, merge keys and multiple documents are errors.
Definitions with the same identity in YAML and JSON are ambiguous and rejected.
Schemas remain JSON Schema documents. Schema validation follows parsing.

Captured configuration includes its source path, original text, parsed value,
SHA-256 of original bytes and SHA-256 of deterministically normalized content.
Reading a captured Git revision must never consult mutable working-tree files.
Errors identify the source document and include parser locations when available.

## Ownership migration

Implementation, tests and documentation are grouped by component identity beneath
`src/`, `tests/` and `docs/`. Each maintained file has one accountable owner.
Shared tooling has an explicit development-tooling owner; generated build output
does not grant authority over source. Cross-owner imports use declared public
entry points. TreeSeed is not reorganized by this migration.

Exact changed-path checks remain authoritative even where root instruction files
require broader directory sandbox grants. Platform/package containment is context,
not an implicit grant of write authority to every descendant.

## Following increments

Increment 2 migrates maintained tests/tooling to TypeScript, formats code, enforces
500-line files and 30-line functions, and exposes linting as a steward operation.
Increment 3 adds mandatory component-led initialization and task proposals, removes
implicit execution limits, and retains cancellation and observable loop guards.
These are delivery intentions, not claims of currently available commands.

Version-three platform/package nodes may declare empty write paths and directory
grants to express containment without execution authority. These empty container
policies do not act as a deny-all ceiling for independently authorized leaf owners.
Explicit nonempty ancestor permission ceilings remain enforced, as does legacy
version-one/two permission inheritance. Container nodes cannot execute assignments.
