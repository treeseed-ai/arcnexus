# Coordination persistence

The coordination-store component owns the SQLite implementation and its transaction
contract. The workday component owns dispatch policy and viewers. Both use the
captured assignment engine; neither authorizes candidate changes by editing state.

The database is private host state. Message insertion, readiness changes and their
event commit together or all roll back. Duplicate message IDs fail without changing
readiness. Readers require schema version 1 and exactly one initialized workday.
Status and ordered events remain inspectable after execution ends. Opening a viewer
does not initialize a missing database or resume interrupted work.
