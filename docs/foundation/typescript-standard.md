# Readable TypeScript standard

Use cohesive classes for lifecycle state and injected collaborators, and small pure
functions for transformations. Keep purpose visible in names and group related
statements with whitespace. Explain invariants and failure behavior where they are
not apparent from the signature. Do not extract meaningless wrappers to meet size
limits or compress statements to hide complexity.

Keep strict TypeScript checking. Explicit `any` is permitted at genuinely dynamic
boundaries. Preserve 500 physical lines per file and 30 per function, method,
constructor or callback, including comments and blank lines. Run formatting and
lint checks without silently rewriting another owner's files.

Use observable acceptance through the built CLI for executable behavior. Preserve
independent checks and captured authority when editing tests or instructions.

## Headers and spacing

Every class and method has a `/** ... */` header. Describe the class responsibility
and its lifecycle collaborators. A method header explains purpose and material
effects or failure behavior. Types already express parameter shapes; do not add
repetitive `@param` annotations or comments that merely repeat a name.

```ts
/** Retains immutable assignment input for later authority checks. */
class AssignmentSnapshot {
  /** Retains the immutable input used by subsequent revision checks. */
  constructor(private readonly source: Readonly<Assignment>) {}

  /** Rejects execution when the caller-supplied revision differs from capture. */
  assertRevision(revision: string): void {
    if (revision !== this.source.revision) throw new Error('Stale assignment');
  }
}
```

Separate methods and top-level declarations with blank lines. Keep imports together,
then leave a blank line before declarations. Logical paragraphs inside methods are
a review concern: group validation, transformation and side effects where useful.
Do not extract trivial wrappers or compress statements to satisfy length checks.

`arcnexus/documentation` and `arcnexus/spacing` provide syntax checks through the
normal lint operation and CI. Inline suppression is disabled. Header presence does
not prove explanatory quality; review names, comments and control flow together.
