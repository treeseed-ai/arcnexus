# Candidate change evidence

The change-inspection library owns Git change enumeration and exact writable-scope
checks. Its public `changes` and `checkScope` functions are declared through the
`candidate-changes` contract. Assignment and workday execution use those checks;
reporting presents the captured path/change-kind evidence.

Enumeration includes staged and unstaged changes, deletions, renames and untracked
files. Scope checks reject paths outside captured authority and symlink traversal.
They detect violations; they do not provide complete operating-system isolation.
The host checks candidate identity and scope around execution and verification.

Maintain this implementation under `src/library/change-inspection`, its tests under
`tests/library/change-inspection`, and this documentation directory. A missing test
directory may be created by an authorized assignment; its ownership is declared
before the directory exists. The shared Node test profile and operation discover
new registered suites without a handwritten filename inventory.
