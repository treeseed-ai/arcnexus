# Continuous integration

CI validates repository guidance and the built TypeScript CLI. Product acceptance
uses temporary real Git repositories and subprocesses; live inference stays separate.

## Contract

The GitHub Actions workflow exposes one stable job, `Repository checks`, on every
pull request targeting `staging` or `main` and every push to those branches. There
are no path filters that could leave a required check pending. A run has a five-minute
timeout; newer runs cancel obsolete runs for the same PR or branch.

The job installs a pinned YAML parser, runs subprocess acceptance tests, validates
tracked skill frontmatter, and uses `git diff --check` to reject whitespace errors
introduced by the change. Existing whitespace outside the change is not a migration
requirement. Pull requests compare against their base; pushes compare against the
previous branch head (falling back to the empty tree for a newly created branch).

Skill validation requires YAML mapping frontmatter with a nonempty string `name`
matching its directory and a nonempty string `description`. Names use lowercase
letters, digits, and hyphens. Additional metadata is allowed. Missing frontmatter,
invalid YAML, empty required fields, and an empty skill inventory fail with diagnostics.
Only Git-tracked `.agents/skills/*/SKILL.md` files are inspected; ignored local context
and personal Codex installations are not dependencies. YAML parsing is safe loading.

## Run locally

Use Node 22 and Git. From the repository root:

```sh
npm ci
npm run check
npm test
node dist/cli.js guidance validate --project .
git diff --check origin/staging...HEAD
git diff --check
```

The built guidance command replaces the Python repository checker. Its Node
acceptance tests exercise temporary Git projects, metadata errors, AGENTS inventory
and diagnostics without depending on this repository's guidance wording.

## Extend with the product

The job also installs Node 22, runs `npm ci`, `npm run check`, and `npm test`
(which builds and exercises the CLI), then checks its help output. Keep the stable
`Repository checks` gate; if checks become separate jobs, make it a final aggregator
that fails when any required job fails or is unexpectedly skipped. Add a platform
matrix only when supported platforms need distinct evidence.

Live model acceptance is separate from fast deterministic CI. Never send credentials
or run paid model work from arbitrary PR code. Record real integration evidence when
introducing or changing harness behavior.

The initial workflow uses read-only repository permissions, pinned action commits,
and no persisted checkout credentials. It uses `pull_request`, not privileged
`pull_request_target`. These choices follow GitHub's
[workflow permissions and event syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
The pinned actions install Node and check out source. The locked
[yaml parser](https://eemeli.org/yaml/) supplies metadata parsing.

A workflow creates check results; branch protection is a separate repository setting.
Require `Repository checks` for staging/main if server-enforced merge gating is desired.
The project release workflow still governs whether agents may merge. Main and
production remain maintainer-controlled.

Repository-aware inspection uses the declared canonical HTTPS origin identity.
After checkout, CI normalizes `origin` to `https://github.com/<owner>/<repo>.git`
before invoking built-CLI catalog checks. GitHub checkout's suffixless remote is
not the repository's declared URL; no fetch or authentication change is required.
