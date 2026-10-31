# Single-steward runtime acceptance

Local live integration on 2026-10-31 used Node 22.22.1, Codex SDK 0.166.0 and
Codex CLI 0.163.0-alpha.10.2, authenticated with the existing ChatGPT login.
The SDK drove the actual CLI through the ignore-user-config launcher with Astra,
medium reasoning, workspace-write and approval never. No test executable was used.

Objective: add a sentence explaining an ArcNexus-managed worktree to a small
fixture's README. The fixture was a committed temporary Git repository; the app
created its candidate, checked Node, ran baseline verification, invoked Codex,
observed only README.md modified, and passed final verification. Source stayed clean.

Run: `47b6d42e-76fe-4181-ba55-45424d8087e0`; result: completed.
Thread: `01a18f56-61f3-7da1-86c5-8e1b1623dfd1`.
Base: `8508984a36ff0c0e7f8ba93a13c5504c748effb7`.
Local evidence is retained under the user's ArcNexus state directory, `runs/<id>`;
the corresponding `workspaces/<id>` retains the candidate for inspection.
This proves harness integration, not the later sample or self-development milestone.

Deterministic acceptance separately exercises the assembled CLI through the real
SDK with a controlled executable, actual Git repositories and host subprocesses.
It checks scope/ignored files, symlinks, unexpected commits, staged rename/deletion,
malformed/blocked/no-change responses, ancestor context, failed baseline and final
checks, and cancellation/timeout. CI performs no live inference.
