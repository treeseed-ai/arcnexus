# Agent guidance validation

`arcnexus guidance validate --project <repository> [--json]` checks the working
checkout using Git's tracked inventory, including staged new files. It reads current
file bytes, not the committed version, and creates no workspace or model execution.

Skill files under `.agents/skills/` require YAML mapping frontmatter, a lowercase
hyphenated name matching their directory, and a nonempty description. Additional
metadata is allowed. Optional `references` metadata, when present, must be a nonempty
array of unique repository-relative paths to readable, tracked regular files. Paths
must not be absolute, empty, contain non-string entries or traversal segments, or
resolve through symlinks in any path component. Missing and untracked paths and
directories are invalid. Referenced files may contain binary data. Omitting
`references` preserves the prior metadata behavior. These checks report through the
existing `invalid_skill` diagnostic; the checker makes no semantic approval claim.
Empty tracked skill inventories fail. The command also inventories
tracked AGENTS.md files and reports readable/unreadable state. It does not validate
prose semantics, policy consistency, instruction effectiveness, or architectural approval.

Exit codes: 0 valid, 1 findings, 2 invalid invocation or unavailable Git project.
JSON contains version, project, status, skill and AGENTS inventories, and file-oriented
diagnostics with stable codes. Text output reports each diagnostic and inventory totals.

The `agent-guidance` steward owns AGENTS.md, bundled skills and maintenance guidance.
`guidance-validation` owns this checker and its tests. Related-owner context does not
grant write authority. Candidate instruction edits cannot redefine captured assignment
permissions, checks or operations; only future assignments adopt integrated changes.

YAML is parsed using the [yaml library](https://eemeli.org/yaml/) with YAML 1.1
scalar behavior for compatibility with the previous checker. Parser errors are
reported as findings. This is data parsing, not executable configuration.
