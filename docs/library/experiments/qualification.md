# Single-steward qualification campaigns

Use the integrated [experiment commands](experiments.md) for new campaigns.
The legacy `node scripts/qualify.mjs <manifest.json> <new-output-directory>`
remains supported by the shared TypeScript runner. Existing absolute-path version-1
campaign manifests retain their behavior and historical evidence labels.

Live qualification is explicit, sequential and Luna-only, with captured acceptance
and retained failed campaigns. Simulated results cannot establish live readiness.
See [prior qualification](../../acceptance/pre-phase-two.md) and
[operations qualification](../../acceptance/steward-operations.md) for historical evidence.
