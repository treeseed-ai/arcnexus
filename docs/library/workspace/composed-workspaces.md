# Composed workspaces and real qualification

Increment three (#32) adds one writable primary repository and explicitly pinned,
read-only dependency worktrees. Existing single-repository environments remain valid.

`architecture/environment.yaml` may declare `workspace` with a `primary` identity
(`id`, canonical HTTPS `repository`) and ordered `dependencies`. Each dependency
provides `id`, `repository`, full immutable `commit`, repository-relative `path`,
`prerequisites`, `setup`, and `generatedDirectories`. Dependency locations must be
ignored, untracked, non-overlapping directories within the primary worktree. They
are managed repositories, never disposable generated outputs.

`prepare`, `run`, and `inspect` accept `--bindings <file>`. The versioned caller file
contains `repositories` (identity to absolute existing checkout) and `tools` (command
name to absolute existing executable). All values are captured. Tool directories are
placed ahead of PATH for target commands; named commands are resolved explicitly.
No fetch, clone, runtime installation or repository initialization is inferred.

Resolve and verify every source's origin identity, cleanliness and exact commit
before preparation. Record ownership before creation. Create detached dependency
worktrees in declaration order, execute their commands in their own roots, then
prepare the primary environment. Freeze dependency inventories after all setup.
During inference dependency mounts are read-only even when primary write access is
explicitly `.`. Check identities, source changes and generated-output inventories
before/after verification and at completion. Retain partial preparation on failure.

Cleanup validates every existing member before deleting any. Refuse changed source,
unknown ignored outputs, redirected/replaced paths or unregistered worktrees. Remove
dependencies before the primary. Record each removal immediately in a separate
receipt; interruption can be inspected and repeated safely. Preserve branches and
execution reports. No claim of atomic cross-repository deletion or OS-wide isolation.

## Qualification campaign

The [qualification command](../experiments/qualification.md) uses a caller manifest with a stable runner,
pinned target revisions, component/objective or assignment files, local bindings,
external acceptance programs, expected outcomes and optional labeled fault injection.
It runs each case once, sequentially; no automatic campaign retries or model fallback.
It writes results outside candidates and exits nonzero unless every case passes.

Cases: ArcNexus report activity/outcome summary; TreeSeed artifact diagnostics;
a real corrective repair after a recorded narrow implementation fault; a precise
SDK-owner boundary escalation; research without edits; review without edits.
Acceptance and the supervising runner are outside candidate write authority. Reports
record revision/toolchain/check hashes, turns, usage, intervention and failure evidence.
A successful model claim alone is never a qualifying result. Changes still require
normal owner review, CI and integration; the campaign cannot commit or merge them.

The first TreeSeed selection mounts the exact CLI source supplying its historical
root lockfile archives and the SDK source corresponding to its assembly contract.
It uses existing Node/Bun tools, committed archives and non-activating checks. It
preserves historical composition manifests and runs no deployment or service setup.

## Workspace preparation evidence

A real TreeSeed preparation completed as run `bd00d3b2-4199-4dfd-b6fa-9bb8e5910ad9`
from Platform revision `d7fa3502ab79a02b20eb393ab8fd88586b553e0e` with application-created
CLI and SDK dependency worktrees. Node 24.19.0 and Bun 1.4.4 prerequisite checks and
both frozen dependency installations passed. Reports and inventories are retained in
ArcNexus user state. This proves preparation, not the six-case Luna qualification gate.
The blueprint references in that historical source revision are subsequently removed
by TreeSeed #866/#867; they are not authority for future assignments.

### Bound tools in steward context

The host supplies resolved absolute executables for captured verification commands,
keeping their original indexes, and includes the declared tool-name bindings in each
turn's context. Use those paths for target commands: a login shell can replace the
inherited PATH. This is executable location context, not extra write authority or
runtime installation. Host verification remains authoritative when the steward
cannot run a command within its sandbox.

A bound executable outside the minimal system filesystem also needs visibility.
Each caller-declared tool binding grants read-only access to its resolved containing
directory (never write access); these directories appear in execution settings.
No arbitrary ancestor directories are exposed. This permits installed tool binaries
outside system locations without exposing the rest of the caller's home directory.

The context also supplies the target PATH explicitly. Apply it after login-shell
initialization for commands that launch nested package scripts; an absolute Bun
invocation alone does not make a nested `bun` command discoverable. Host commands
and steward context use the same captured tool-directory ordering.
