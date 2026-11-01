# Verified candidate snapshots

General execution (#78) retains immutable Git tree/commit objects as internal
snapshots, without moving the source branch or publishing commits. A candidate
revision records its snapshot and captured architecture revision separately.
Assignment workspaces begin from a verified snapshot, not another owner's unfinished
edits. The supervising host captures snapshots with a temporary index; it never
stages user files or lets models mutate repository identity.

Reconciliation uses a three-way merge of the assignment base, latest verified
candidate and completed assignment snapshot. Conflicts preserve all three snapshots
and require attention. A successful merge is only a proposal: assembled checks and
independent review must pass before the verified-candidate pointer changes.
