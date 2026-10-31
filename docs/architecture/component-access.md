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

The `arcnexus` profile uses `:minimal` reads plus the validated project paths and a
private per-run temporary directory. TOML path keys are explicitly quoted in raw
SDK config override strings because the SDK's structured flattener does not quote
them. The probe runs the same profile and raw overrides with an isolated empty
`CODEX_HOME` under the run directory; it has no copied authentication state. Probe
output is retained as `sandbox-preflight` evidence and is not counted as a component
verification command. The requested profile name and paths are included in the
execution manifest.

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
See [official permission profiles](https://learn.chatgpt.com/docs/permissions) and the
[Codex SDK raw config override documentation](https://github.com/openai/codex/blob/main/sdk/typescript/README.md).

## Delivered acceptance

The default SDK construction path passed 57 deterministic runtime tests, including
explicit broad access, missing policies, ancestor validation, startup failure and
cancellation. `node scripts/check-permissions.mjs` uses the production profile builder
with the installed CLI and no inference to check allowed writes, related reads,
and denied related writes/unrelated reads and writes.

Luna live run `4fcde85a-01db-46f1-b6eb-17536fbe6f9f` completed a documentation
assignment using only `related` reads and `docs` writes; independent inspection
confirmed the expected sentence and only `docs/README.md` changed. Its report,
profile, probe log, exact prompt and events are retained under the normal state root.

The implementation originated in Luna run `56a64782-fc67-40f5-b4a2-91709a30b110`.
Its host verification caught one test executable that edited files during preflight.
Caller review corrected that fixture, made startup cancellation use the managed
command runner, and connected the sandbox acceptance script to the production
profile builder. This is assisted self-development; the failed original record
remains intact.
