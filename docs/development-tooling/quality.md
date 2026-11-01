# TypeScript and code quality

Issue #64 introduces the following development contract. These commands and limits
are delivery requirements until implementation and acceptance are complete.

Maintained application code, tests and executable tooling use TypeScript. Test
suites use cohesive classes with explicit fixture lifecycle and scenario methods.
Production classes own dependencies or lifecycle state; pure helpers remain small
functions. Public CLI behavior and production construction-path tests are preserved.

`npm run check` preserves strict compiler checking and includes tests/tooling.
Linting is syntax-based and does not require TypeScript type analysis. Explicit
`any` remains allowed; do not replace useful work with exhaustive annotation rules.

## Commands

- `npm run format` formats maintained files; `npm run format:check` checks them.
- `npm run lint` checks maintained code without changing it.
- `npm run lint:fix` applies supported fixes within the caller-selected checkout.
- `npm test` builds the application and TypeScript tests, then runs Node acceptance.

Formatted code has at most 500 physical lines per file and 30 per function, method,
constructor or callback, counting comments and blank lines. Inline suppression of
size and ownership checks is prohibited. Generated artifacts, dependencies,
lockfiles, external payloads and retained historical evidence are excluded.
Split responsibilities rather than compressing lines or adding trivial wrappers.

## Steward integration

Components expose fixed owner-scoped lint operations. Agents receive their output
through the existing operation bridge. Captured final verification also runs the
repository-wide check. Neither host checks nor lint operations silently format or
modify source; a steward may fix only its originally captured writable scope.

CI checks formatting, lint, ownership, types, build, guidance and deterministic
acceptance. Its test-infrastructure watchdog is separate from application execution
limits. Candidate guidance/configuration edits cannot weaken captured host checks.

The lint configuration uses the syntax-only
[typescript-eslint recommended configuration](https://typescript-eslint.io/users/configs/).
The [ESLint function-length rule](https://eslint.org/docs/latest/rules/max-lines-per-function)
is exercised against ordinary functions, callbacks and TypeScript constructors.
Do not enable a typed-lint preset merely to preserve compiler checking; the two
checks are independent.

## Compiled fixture payloads

Maintain executable fixture sources as TypeScript (`.mts` where the target contract
uses ESM `.mjs` filenames). `npm run build` compiles them into `.fixture-build`,
separately from application and test output. Qualification setup materializes the
compiled payload together with the fixture's configuration and documentation before
creating its pinned Git revision. Do not copy raw fixture source directories into a
qualification target or run their uncompiled tests directly.

This preserves existing target contracts and tests the actual compiled programs.
The fixture catalog and supervising-build hash include the compiled payload; a
missing build is an explicit preparation error. Maintained fixture source participates
in type checking, formatting and linting. Generated payloads are ignored, disposable
outputs, and never widen a steward's source permissions.

Existing acceptance-script paths remain compatibility launchers. Current experiment
definitions capture the standalone compiled checks from `dist/experiments/checks`,
including any declared dependencies, so execution does not depend on mutable source
launchers. The directory-permission acceptance probe uses the installed Node runtime.

Pinned qualification revisions retain their original file layouts. Standalone acceptance
checks support both the historical flat report paths and the current owner directories,
without changing the required report behavior or rewriting pinned inputs. Guidance
acceptance resolves the maintenance reference for the target layout.
