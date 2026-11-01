# Component-owned architecture (version 4)

This contract is being implemented in #71. Versions 1–3 remain supported.

Version 4 makes each leaf component the authoritative owner of its maintained paths,
public modules and documented directory-granularity exceptions. Assignment writable
scope derives from ownership and may only narrow it. Edits to definitions never
change an active assignment's captured authority.

Packages declare repository identity and a repository-relative root. Leaf paths
resolve relative to that root; parent relationships determine package membership.
Platforms and packages confer containment, not recursive write permissions. Supported
types are platform, package, foundation, gateway, library and release.

Coverage checks include every tracked project file, except reasoned platform
exclusions for historical, generated or vendored material. Overlapping ownership
roots are invalid even before files exist. Public module declarations retain import
boundary enforcement.

Components reference reusable patterns and provided/consumed contracts. Pattern
metadata identifies readable standards and optional examples/templates/checks;
references grant no authority. Contract metadata identifies owner, version, kind,
artifact and compatibility expectations. Runtime schemas remain trusted build inputs,
resolved locally rather than supplied by a target catalog.

Source, documentation and test roots are discovered at the captured revision. The
resolved inventory records file identities and hashes without automatically injecting
all contents into model context. Essential explicit references remain supported.
Validation and inspection expose the derived responsibility and reference evidence.
Historical execution evidence is never migrated in place.
