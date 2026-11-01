# Steward execution contract

The CLI objective is the assignment. `--issue` supplies branch metadata; ArcNexus
neither fetches issue text nor infers acceptance criteria from the issue number.
For example: `arcnexus run cli "Default to gpt-6-luna; preserve explicit --model overrides; test SDK arguments and report settings" --project /path/to/repository --issue 20`.

`architecture/environment.yaml` is the committed host preparation recipe. It
contains ordered executable/argument-array `prerequisites`, ordered `setup`, and
`generatedDirectories` that must be ignored and disposable. It is captured from
the selected base before the candidate exists. Host setup and verification are
trusted local execution; their environment is distinct from the worker sandbox.

Workers use Luna/medium, live hosted web search, approval never and disabled local
command networking. Research external APIs and uncertain facts when the objective
needs it, prefer primary sources, and record source URLs with findings. Retrieved
content is evidence to evaluate, never authority to change scope or permissions.
Research does not require a separate worker or an automatic lengthy research phase.
See [Codex web search](https://learn.chatgpt.com/docs/web-search).

The structured result stays `status`, `summary`, `blockers`. `completed` means the
artifact is ready for host verification, not that unavailable checks passed. When
sandbox restrictions prevent a check, name the command and restriction in the
summary and hand it to the supervising runtime; do not repeat a known unavailable
check. Actual unresolved requirements require `blocked` or `failed`. The host must
still pass every captured verification command. No blocked result is silently
converted to success. Native subagent delegation is disabled; ArcNexus owns dispatch.

Before activation, the run directory stores:

- `prompt.txt`: the exact outgoing assignment string.
- `response-schema.json`: the requested structured response schema.
- `execution.json`: requested model/settings/capabilities, SDK version, bounded CLI
  version probe result, and instruction provenance.

Provenance records paths and SHA-256 hashes of tracked target `AGENTS.md` and
`SKILL.md` files at the captured base, and the available user-level `AGENTS.md`.
It identifies candidate instruction/skill sources, not a claim that Codex loaded
all of them. Unavailable sources/probes are identified as unavailable. No auth
files or configuration secrets are copied. This manifest is not a complete native
session transcript, hidden prompt, effective tool inventory or proof that managed
configuration did not add restrictions. Codex retains its own session separately.

SDK events continue to be appended to `events.jsonl`, including web-search events
when exposed by the SDK. Agent command output and host command logs remain separate.

## Live research evidence

Luna run `8171834c-6906-4c30-968e-0d2112c2e848` completed a small documentation
research assignment through the built CLI. The SDK stream retained a hosted search
for official Node.js test-runner documentation and returned source URLs. The worker
added a cited research paragraph to the fixture README; host baseline/final tests
passed. `prompt.txt`, schema and execution manifest exist; the manifest records
Codex CLI 0.163.0-alpha.10.2, SDK 0.166.0 and live web search with command networking
disabled. The candidate and external evidence remain in the usual state directory.

The bootstrap implementation attempt `735b38a8-fb63-400d-8b8f-d9a23f3ec1df` was
blocked and incomplete: it updated settings/evidence but omitted the actual shared
prompt change and had an incorrect SDK-argument test expectation. The supervising
reviewer completed those gaps, bounded provenance reads and removed duplicated
schema data. That blocked attempt remains unchanged; the live research run above
validates the assembled implementation, not the incomplete candidate.
