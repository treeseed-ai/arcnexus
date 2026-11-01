# Readability and delivery verification (#73)

The grouped component layout is now the maintained structure. This increment makes
that structure easier to read and verifies each delivery lifecycle independently.

## Readability

Every maintained class and concrete method, including constructors, has a documentation
header describing its responsibility or observable effect. Comments should explain
material mutations, lifecycle ownership and failure behavior; TypeScript already
provides parameter types. Avoid restating a method name or adding empty boilerplate.
Separate methods, top-level declarations and import blocks with blank lines. Keep
related statements in logical paragraphs. Existing 500-line file and 30-line function
limits include blank lines and body comments; do not compress code to satisfy them.

Syntax-only ESLint checks header presence and spacing, while human review checks
usefulness. Strict TypeScript remains independent and explicit any remains valid.
Inline configuration cannot disable these rules. Maintained fixtures and tooling
participate; historical evidence and generated payloads do not.

Acceptance exercises ESLint as a program against missing headers, missing spacing,
valid readable examples, constructor/callback limits and attempted suppression.
Refactoring preserves existing named test scenarios and runtime behavior.

## Delivery workflows

Development validates pull requests targeting staging. Staging validates pushes to
staging. Production validates pull requests targeting main, pushes to main and
published releases. Each calls one reusable verification workflow for formatting,
lint, strict types, build, full deterministic tests, catalog/guidance checks and the
assembled CLI. Production additionally checks the assembled distribution.

Actions remain pinned with read-only permissions and six-hour job ceilings.
Development cancels superseded PR runs; staging and production preserve running
verification. No workflow publishes releases, tags, packages, deployments or images.
The repository rules are inspected before changing checks; existing requirements
must remain satisfied throughout migration.

Workflow acceptance checks triggers, shared wiring, permissions, pins, watchdogs,
concurrency and absence of publication actions. Actual development and staging CI
remain integration gates. Production is not triggered by unauthorized main changes.

## Qualification

After deterministic verification, run one explicit Luna assignment against a pinned
post-migration revision. A narrow library owner receives captured standards/contracts
and discovered test/documentation roots, obtains scoped lint/shared test feedback,
and makes a useful independently accepted change. Retain initialization, planning,
operations, selection and diff evidence; failures are separate invocations.

Run the deterministic two-owner handoff against the migrated layout. Verify TreeSeed
still validates through the legacy reader and its checkout remains unchanged. No
React, container implementation, new coordination behavior or automatic integration
is introduced. Review and integrate changes through staging.

Implementation references: [ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules)
and [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
