# Continuous integration

The initial CI validates repository guidance and the validator itself. It does not
claim application correctness: ArcNexus has no application build or runtime yet.

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

Use Python 3.12 and Git. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-ci.txt
.venv/bin/python -m unittest discover -s tests/ci -v
.venv/bin/python scripts/check_repository.py
git diff --check origin/staging...HEAD
git diff --check
```

The checker exits zero on success and nonzero on invalid guidance or a Git error.
Acceptance tests invoke it as a program in temporary Git repositories and exercise
valid and invalid input. These tests do not depend on the wording of AGENTS.md.

## Extend with the product

When phase one adds the application, add its frozen dependency install, static
checks, tests, build, and assembled CLI smoke test to this workflow. Keep the stable
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
The pins identify published [checkout](https://github.com/actions/checkout/releases/tag/v4.3.1)
and [setup-python](https://github.com/actions/setup-python/releases/tag/v6.1.0) releases;
[PyYAML](https://pypi.org/project/PyYAML/6.0.3/) supplies YAML parsing.

A workflow creates check results; branch protection is a separate repository setting.
Require `Repository checks` for staging/main if server-enforced merge gating is desired.
The project release workflow still governs whether agents may merge. Main and
production remain maintainer-controlled.
