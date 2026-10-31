# Run one component steward

`arcnexus run <component-id> "<objective>" --project <repository>` creates a fresh
managed worktree and prepares its environment. Optional flags: `--base`, `--issue`,
`--model`, `--timeout-seconds`, and `--codex-path`. Workspace rules and cleanup are
in [workspaces.md](../workspace/workspaces.md). Default model: `gpt-6-luna`; reasoning: medium;
overall limit: 900 seconds. Verification commands have a 120-second individual limit.

Commit a definition at `architecture/components/<id>.json`:

```json
{
  "schemaVersion": 1,
  "repository": "identity",
  "role": "systems-engineer",
  "executionProfile": "luna",
  "interfaces": [],
  "documentation": ["README.md"],
  "tests": ["tests"],
  "relatedIds": [],
  "questions": [],
  "patterns": [],
  "id": "identity",
  "type": "library",
  "purpose": "Session expiration semantics",
  "path": "src",
  "objectives": ["Predictable expiration boundaries"],
  "constraints": ["No network access needed"],
  "allowedWritePaths": ["src", "tests", "README.md"],
  "access": {"readPaths": ["."], "writeDirectories": ["."]},
  "verification": [{"command": "npm", "args": ["test"]}]
}
```

Commit matching role and execution profile definitions as in the
[identity fixture](../../fixtures/identity/architecture). `parentId` is optional;
`questions` and `patterns` are required arrays and carry architectural context.
All parents are loaded in root-to-leaf order. IDs use letters, digits, underscore and
hyphen. Library, gateway and foundation responsibilities can execute. Paths are explicit relative files
or directories, not globs. Definitions and verification commands are captured before
setup/agent execution; changing them cannot authorize new work in that execution.

The steward follows [host-checked activities](../assignment/steward-workflow.md): specification
and regression tests, implementation, then read-only review in the same thread.
Research/review assignments use one read-only turn and can succeed without edits. The caller owns Git commits, issues, PRs and integration. The runtime
never embeds ArcNexus repository policy in generic target prompts. Read target
instructions normally; report conflicts rather than claiming unperformed work.

The TypeScript [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) drives the local
CLI (`codex` on PATH, or `--codex-path`). Sign into that CLI beforehand. Existing
Codex authentication is reused without copying secrets. The Linux `setsid` utility isolates the CLI process group for cancellation.
A POSIX launcher inserts
`--ignore-user-config`; the executable must support it. Explicit configuration uses
an explicit component permission profile, approval never, network disabled for local agent commands, and live hosted web search
enabled. User config and inherited API-key/provider variables are not passed.
Target `.codex/config.toml` files are rejected in phase one. Managed host restrictions
still apply. Setup commands run on the host and are a separate trusted boundary.

Baseline verification must pass before activation. The agent returns JSON with
`status` (`completed`, `blocked`, `failed`), `summary`, `blockers`, findings,
activity outcomes, regression checkpoint, review findings and owner requests.
Runtime checks actual changes and reruns captured commands; agent claims alone do
not establish success. Unchanged change assignments, changed HEAD/branch, out-of-scope edits, escaping
symlinks, malformed results, blocked work, and failed checks exit nonzero. Scope
inspection is detection, not complete OS isolation. Changed tests/instructions are
flagged for human review; they cannot redefine the accepted objective.

The external run directory retains `report.json`, `report.md`, `events.jsonl`, command
logs, `changes.patch`, and base64 snapshots of untracked files in `new-files.json`.
Reports include context, objective, configuration, usage when available, verification,
changed paths/kinds, and failures. Reports and logs may contain private project data;
keep the state directory private. Cancellation preserves partial evidence. A hard kill
leaves an incomplete record, with explicit manual recovery as documented for workspaces.

`completed` means observed in-scope changes passed the captured checks; caller review
and independent acceptance are still required before integration. No auto-commit,
merge, force cleanup, or automatic resume is performed.

## Separate index and working-tree evidence

Scope checks inspect staged changes against the captured base and unstaged changes
against the index independently, plus untracked files. Restoring a working file
does not hide its staged edit. Both views are checked before and after verification;
staged symlinks are rejected even if the working file was restored to a regular file.
In-scope index-only changes count as changes, not `no_changes`.

`report.json` retains `stagedChanges` and `unstagedChanges` separately. The existing
`changes` list is their path union plus untracked files (one entry per path); use
the separate arrays when a path has different change kinds in each view.
`staged.patch` captures base-to-index; `unstaged.patch` captures index-to-working-tree.
`changes.patch` remains the net base-to-working-tree patch for compatibility.
Evidence capture does not stage, unstage or reset the candidate.

See [the execution contract](../steward/execution-contract.md) for objectives, research,
verification handoff and exact prompt/configuration evidence.

Every definition must declare [component filesystem access](../architecture/component-access.md);
whole-worktree access is allowed only when explicitly declared as `.`.

See [bounded corrective attempts](../assignment/corrective-attempts.md) for opt-in `--max-attempts 2`.

Workflow evidence lives in `activities.jsonl` and `turns/<n>/`. Implementation
attempts are counted separately from activity turns. See the workflow reference
for four planned turns (including planning) and six maximum with opt-in correction.
[Workdays](../workday/workdays.md) retain those engineering allowances per assignment and add
a shared, bounded coordination/continuation allowance; handoffs do not reset counters.
