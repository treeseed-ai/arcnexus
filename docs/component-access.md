# Explicit component filesystem access

Every component definition must declare `access`; there is no inferred or legacy
fallback. Paths are repository-relative. `.` explicitly means the whole worktree.

```json
{
  "access": {
    "readPaths": ["src", "tests", "docs", "package.json", "node_modules"],
    "writeDirectories": ["src/identity", "tests/identity", "docs/identity", "dist"]
  }
}
```

An explicit broad policy is also valid:

```json
{"access":{"readPaths":["."],"writeDirectories":["."]}}
```

`readPaths` grants reads; writable directories are also readable. Every
`allowedWritePaths` entry must be covered by a declared writable directory. Exact
file/path checks still apply after execution and may be narrower than the directory
sandbox. No parent directory is inferred from a writable file. Parent component
policies are captured as context; the executable leaf supplies the command policy.

After preparation, declared writable paths must be real directories, not files or
symlinks. Missing declared writable directories may be created empty before the
worker starts. Read paths must exist. Reject symlink components in either kind of
path. Invalid, missing or unsupported policies stop before inference.

ArcNexus generates a named Codex permission profile through SDK config overrides.
It does not pass legacy `--sandbox` or `sandbox_workspace_write` settings that would
override the profile. Hosted search stays live, local command networking disabled,
Luna/medium and approval never. Native subagent delegation remains disabled.
The requested profile is retained in execution evidence. A bounded sandbox startup
probe uses the selected executable and profile before inference; failure has no
broader-permission fallback.

Besides declared project paths, the policy grants Codex's `:minimal` runtime reads
and one private per-run temporary directory outside the candidate. The latter is
passed as `TMPDIR`; there is no whole `/tmp` write grant. Generated outputs are not
silently writable: declare any directories needed for worker-side build/test output
in `writeDirectories`. Host setup and final verification use their own trusted
execution boundary and are unaffected by worker read/write restrictions.

A restricted worker is not automatically granted access to the repository's shared
Git storage outside the worktree. The host owns Git inspection/integration. Related
component files can be declared readable without being writable. Permission profiles
apply to sandboxed local commands, not all host-side Codex instruction loading,
web search, managed integrations or the supervising process. Source hashes are
provenance, not proof that the model saw only declared files.

## Compatibility evidence

Directory policies were tested on Linux with Codex 0.163.0-alpha.10.2 using
`codex sandbox --permission-profile <name> --cd <fixture> -- python3 <probe>`.
An implementation directory was writable; a related directory was readable but
not writable; an undeclared file was not readable. No inference was used.

An exact-file write rule on this installed CLI failed before command execution:
`bwrap` attempted metadata paths below a regular file and exited with ENOTDIR.
That is a version/configuration finding, not a general claim that file permissions
are impossible. It matches [upstream issue #52985](https://github.com/openai/codex/issues/52985).
We therefore use explicit directories, not silently widened file rules.
See [official permission profiles](https://learn.chatgpt.com/docs/permissions).
