
## Read-only revision evidence

Review turns receive a host-captured diff as untrusted evidence, with its SHA-256
and provenance retained in the turn record. A review assignment receives the pinned
base revision against its first parent (or the empty tree for a root commit), limited
to declared readable paths. The implementation-review turn receives the current
candidate diff and new-file contents. The steward does not need access to the source
repository's Git metadata; permissions remain unchanged. A review request must name
the active component as requester even when the needed decision belongs to a parent.
