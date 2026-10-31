# Maintaining agent guidance

Use this procedure when changing repository instructions or bundled skills. The
`agent-guidance` component owns `AGENTS.md`, `.agents/skills/`, and this procedure;
`guidance-validation` owns the validator implementation and its tests.

## Review the guidance as a set

1. Read the current `AGENTS.md` and all bundled `.agents/skills/*/SKILL.md` files
   relevant to the change. Also read any skill whose instructions interact with the
   proposed guidance. Check the instruction file and skills together for consistent
   scope, terminology, authority, and procedures; do not review a skill in isolation
   when `AGENTS.md` establishes its boundaries.
2. Compare proposed text with the captured assignment, component ownership, and
   architecture. State whether a rule is current policy or a proposal for future
   runs. Guidance edits do not change the authority, permissions, acceptance checks,
   or operations captured for the assignment already in progress.
3. Keep changes within the authorized paths. If a proposed rule needs architectural
   approval or another component's work, record the precise request for the owner;
   related-component context does not grant write authority.

## Validate tracked guidance

From the repository root, run:

```sh
node dist/cli.js guidance validate --project .
```

The validator inspects the Git-tracked inventory (including staged new files) using
current working-tree bytes. Exit code `0` means no findings, `1` means validation
findings, and `2` means an invalid invocation or unavailable Git project. Review
each diagnostic and its path, then fix findings within this component's authority.
With `--json`, the command reports version, project, status, skill and AGENTS
inventories, and file-oriented diagnostics with stable codes. Text output lists each
diagnostic and inventory totals. Rerun the command after corrections and retain its
actual output and exit status for the handoff.

This check validates skill frontmatter metadata and inventories tracked `AGENTS.md`
files with readable/unreadable status. Skill metadata must be a YAML mapping, have a
lowercase hyphenated `name` matching the skill directory, and a nonempty `description`;
an empty tracked skill inventory is a finding. It does not judge prose meaning,
consistency between instructions, whether a rule is effective, or whether a change
has architectural approval. Perform those semantic reviews directly against the
captured assignment and applicable project guidance. A clean validator result is
not semantic approval.

If a needed diagnostic or metadata rule is missing, do not edit validator source or
tests here. Request the change from the `guidance-validation` owner, with the
observed gap, desired behavior, and acceptance evidence. Continue the independent
guidance review that remains authorized; do not claim the missing validation was
performed.

## Handoff and integration

Report the changed guidance paths, the files and bundled skills reviewed, semantic
consistency findings, and the validator command, exit code, and relevant diagnostics.
Call out unresolved owner or architecture requests explicitly. Candidate guidance
is a proposal for future integrated work and never expands the current assignment's
captured authority. The caller owns commits, pull requests, and integration; hand
off the verified candidate without committing or integrating it.
