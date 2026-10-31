# Interrupted workspace cleanup

Cleanup persists versioned ownership intent before removing worktrees. Member
progress and primary removal are recorded separately from immutable run reports.
A retry may reconcile an absent primary only with matching durable intent, no Git
registration, accounted-for dependency removals and confirmed resource shutdown.
Replaced paths, unexplained disappearance and ambiguous ownership are refused.
Existing completed receipts remain supported. Branches and reports are preserved.
A stale execution lock still requires caller inspection; cleanup does not resume
assignments or automatically recover interrupted execution.
