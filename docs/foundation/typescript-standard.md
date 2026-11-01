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
