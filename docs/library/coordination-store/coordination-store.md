# Coordination persistence

The coordination-store component owns the SQLite implementation and its transaction
contract. The workday component owns dispatch policy and viewers. Both use the
captured assignment engine; neither authorizes candidate changes by editing state.

The database is private host state. Message insertion, readiness changes and their
event commit together or all roll back. Duplicate message IDs fail without changing
readiness. Readers require schema version 1 and exactly one initialized workday.
Status and ordered events remain inspectable after execution ends. Opening a viewer
does not initialize a missing database or resume interrupted work.

## General execution inbox

General execution uses the separate version-two store; version-one reports remain
readable but cannot resume under its scheduler. Requests and ordered correlated
replies are retained together in each participant's inbox projection. A resumed
recipient receives the exact answer and decision history, not only the original
request. Acceptance records intent and does not prevent later clarification.
Clarification preserves the existing plan and undelivered dependency milestone.
New decisions cannot reopen terminal assignments; exact repeated replies remain
idempotent. A second outstanding question on the same request must be answered
before another question replaces it.
