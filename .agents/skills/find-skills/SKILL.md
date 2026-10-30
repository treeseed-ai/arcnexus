---
name: find-skills
description: Use when the user asks to discover skills or a demonstrated capability gap warrants skill discovery.
---

# Find a skill for a real gap

First inspect available skills and tools. Ordinary implementation questions are not
an automatic reason to search for or install a skill. Reuse existing capabilities.

When discovery is needed, identify the missing capability, inspect candidate source
instructions, and assess scope, dependencies, permissions, and compatibility with
the ArcNexus charter. Popularity alone does not establish quality or safety.

Present a small relevant recommendation with source and the concrete gap it fills.
Installation requires explicit user authorization; discovery is not installation.
Verify the installation method from current authoritative documentation rather than
copying an assumed package-manager command. Repository-local skills belong under
`.agents/skills/`; do not install globally or update unrelated skills by default.

If no suitable skill exists, report that and proceed with available tools when the
task remains feasible. Do not create a skill just because a one-off task exists.
