# Run one component steward

`arcnexus run <component-id> "<objective>" --project <repository>` creates a fresh
managed worktree and prepares its environment. Optional flags: `--base`, `--issue`,
`--model`, `--timeout-seconds`, and `--codex-path`. Workspace rules and cleanup are
in [workspaces.md](workspaces.md). Default model: `gpt-6-astra`; reasoning: medium;
overall limit: 900 seconds. Verification commands have a 120-second individual limit.

Commit a definition at `architecture/components/<id>.json`:

```json
{
  "id": "identity",
  "type": "library",
  "purpose": "Session expiration semantics",
  "path": "src",
  "objectives": ["Predictable expiration boundaries"],
  "constraints": ["No network access needed"],
  "allowedWritePaths": ["src", "tests", "README.md"],
  "verification": [{"command": "npm", "args": ["test"]}]
}
```

Optional `parentId`, `questions` and `patterns` carry applicable architectural context.
All parents are loaded in root-to-leaf order. IDs use letters, digits, underscore and
hyphen. Only library leaves execute in phase one. Paths are explicit relative files
or directories, not globs. Definitions and verification commands are captured before
setup/agent execution; changing them cannot authorize new work in that execution.

The systems-engineer steward documents intent, adds failing observable tests, then
implements. The caller owns Git commits, issues, PRs and integration. The runtime
never embeds ArcNexus repository policy in generic target prompts. Read target
instructions normally; report conflicts rather than claiming unperformed work.

The TypeScript [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) drives the local
CLI (`codex` on PATH, or `--codex-path`). Sign into that CLI beforehand. Existing
Codex authentication is reused without copying secrets. The Linux `setsid` utility isolates the CLI process group for cancellation.
A POSIX launcher inserts
`--ignore-user-config`; the executable must support it. Explicit configuration uses
workspace-write, approval never, network disabled for agent tools, and web search
disabled. User config and inherited API-key/provider variables are not passed.
Target `.codex/config.toml` files are rejected in phase one. Managed host restrictions
still apply. Setup commands run on the host and are a separate trusted boundary.

Baseline verification must pass before activation. The agent returns JSON with
`status` (`completed`, `blocked`, `failed`), `summary`, and `blockers` (string array).
Runtime checks actual changes and reruns captured commands; agent claims alone do
not establish success. No changes, changed HEAD/branch, out-of-scope edits, escaping
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
