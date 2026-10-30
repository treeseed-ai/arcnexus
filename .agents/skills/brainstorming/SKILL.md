---
name: brainstorming
description: Use when a new capability or architectural decision needs its scope clarified; reuse already confirmed designs.
---

# Clarify the next useful capability

Read the charter, request, and relevant existing decisions. Reuse answers already
provided. If intent and acceptance are clear, summarize the slice and proceed within
authorization. Do not restart discovery or require a second approval.

If a material choice is missing, ask one focused question and continue independent
work. Offer alternatives only when they help settle that choice. State consequential
assumptions. Architectural changes outside approved scope need the architect's decision.

Describe the smallest useful result, its observable acceptance, relevant constraints,
and what is deferred. Use a short issue or chat description for small work. Write a
short `docs/` design only when decisions need a durable reference; no compulsory
workshop, visual server, or separate document for a routine change.

For ArcNexus, favor a real objective → steward → verified change → report loop.
Full UI, agent taxonomy, and general orchestration are not bootstrap prerequisites.
Use the writing-plans skill only when the slice needs multiple implementation steps.

For a consequential new written design, a focused independent reader check may test
whether a builder can act without guessing architectural intent. It is optional,
not a new approval gate. Do not dispatch agents for routine wording edits.
