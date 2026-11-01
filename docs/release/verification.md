# Delivery verification

`development.yaml` verifies PRs targeting staging and cancels superseded PR runs.
`staging.yaml` verifies every pushed integration candidate. `production.yaml`
verifies PRs targeting main, main pushes and published releases. Staging and
production never cancel an in-progress verification merely because another arrives.

All three call `verification.yaml`: dependency installation, formatting, lint,
strict TypeScript, build and the complete deterministic test suite, architectural
ownership, guidance metadata and assembled CLI checks. The suite includes experiment
and sequential workday acceptance without paid inference or authentication.
Production additionally checks distribution executability and the packaged schema
registry. No workflow creates releases, tags, deployments, images or publications.

Actions are pinned to immutable revisions, permissions are contents-read, and jobs
retain the six-hour infrastructure ceiling. This ceiling does not create an
application execution timeout. At migration, staging and main had no required named
checks or review rules; no branch protection was removed. Future rules should select
the observed reusable `Repository checks` job for the applicable lifecycle.
