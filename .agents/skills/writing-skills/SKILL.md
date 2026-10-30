---
name: writing-skills
description: Use when creating, editing, or validating repository-local agent skills.
---

# Maintain useful skills

A skill should improve a concrete agent decision with little context overhead.
Use the available skill-creator guidance when authoring; do not require a framework
or unavailable companion skill. Project purpose belongs in AGENTS.md/charter, with
links from skills rather than repeated copies.

Before changing guidance, identify its observed failure or realistic scenario.
Record what the old guidance causes and the desired observable outcome. For a
substantial workflow rewrite, run a focused read-only subagent scenario before and
after the edit when available. Do not ask it merely whether the wording looks good.
One evaluation can cover interacting skills; no fixed sample quota or per-skill
review ceremony. Small corrections can use direct scenario walkthroughs.

Preserve a valid YAML `name` and narrowly scoped `description`. Keep instructions
self-contained, consistent with user authorization, and proportional to task risk.
Use references only for genuinely needed detail; verify they exist. Do not leave
mandatory links to uninstalled skills or introduce recursive process prerequisites.

Validate format and local references, then replay the relevant scenario and inspect
the result. Distinguish static checks from behavioral evidence. Fix demonstrated
ambiguity; do not accumulate hypothetical prohibitions or claim perfect compliance
from one test. Preserve existing work while revising it; never delete changes merely
to satisfy a ritual. Use the release workflow for review and integration.
