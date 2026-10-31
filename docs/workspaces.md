# Managed workspaces

Phase-one contract: Linux/POSIX, Node 22 and Git installed on the host.
Build with `npm ci && npm run build`; invoke `node dist/cli.js`.

`arcnexus prepare --project /absolute/repository [--base ref] [--issue number]`
creates a unique branch and linked worktree at a resolved commit (default HEAD).
The source must be clean. No fetch, clone, source checkout change, or commit occurs.
`arcnexus cleanup <workspace-id>` removes only an inactive, registered worktree
without source changes or unknown ignored files. Branches and reports are retained.
A removed workspace can be cleaned again. There is no force-discard option.

State lives in `${XDG_STATE_HOME:-~/.local/state}/arcnexus`, or the explicit
`ARCNEXUS_STATE_DIR` directory. Records and logs live under `runs/<id>`; candidates
under `workspaces/<id>`. One exclusive lock covers preparation, execution and cleanup.
After a hard interruption, inspect the lock's PID and retained record; only after
confirming the process is gone may the caller remove the stale lock. No automatic
recovery is attempted. State is private to the current OS user.

Commit `architecture/environment.json` in the target repository:

```json
{
  "schemaVersion": 1,
  "prerequisites": [{"command": "node", "args": ["--version"]}],
  "setup": [{"command": "npm", "args": ["ci"]}],
  "generatedDirectories": ["node_modules", "dist"]
}
```

Version 1 and all three arrays are required. Commands run without a shell from the worktree root,
using installed host tools and normal environment credentials. Setup commands are
trusted project code and can use the network. They must not change tracked files;
new outputs must be ignored by Git and inside declared generated directories.
Paths must be relative, normalized and cannot name `.git` or escape the workspace.
Submodules are unsupported in this initial slice. No system runtimes are installed.

Records snapshot the configuration, base, source, branch, timestamps and command
results. Full stdout/stderr is retained in per-command logs. Failed and cancelled
workspaces remain available. Each command has a 120-second limit and preparation
has a 900-second overall limit (`--timeout-seconds` can shorten/extend the latter).
SIGINT exits 130; invalid/preflight input exits 2; operational failures exit 1.
Successful preparation exits 0 and prints the record, including workspace ID/path.
Cleanup refuses changed tracked/untracked files and unknown ignored files (including
secret files). It deletes only declared ignored generated outputs with the worktree.
Concurrent external edits during cleanup are unsupported; stop editors/builders first.

Git worktree operations follow the [Git documentation](https://git-scm.com/docs/git-worktree).

## Evidence-preserving cleanup contract

Cleanup must retain `report.json` and `report.md` byte-for-byte, including the original
status, finish time and elapsed duration. Removal metadata belongs in a separate
`cleanup.json` in the run directory. CLI cleanup output preserves the run status and
adds `cleanupStatus: "removed"`; cleanup must not invoke execution finalization.
Repeated cleanup leaves both reports and removal metadata unchanged. If a new file,
directory or symlink occupies a previously removed path, refuse to delete it.
Legacy records already marked `removed` are accepted only when the path is absent;
they cannot reconstruct evidence overwritten by the earlier implementation.

Removal writes `cleanup.json` atomically with `cleanupStatus: "removed"` and
`removedAt` (an ISO timestamp). This lifecycle receipt is separate from execution
evidence and is not rewritten on retries. An absent legacy workspace succeeds
without creating a receipt or changing its existing reports.
