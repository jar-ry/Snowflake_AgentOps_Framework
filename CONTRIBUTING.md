# Contributing

Thanks for your interest in improving the Snowflake AgentOps Framework. This
document describes how changes are proposed, reviewed, and merged.

## Repository layout

- **Framework code** lives at the repo root: `setup/`, `evaluation/`, `app/`,
  `config/defaults.yaml`, `ci/`, `docs/`.
- **User configuration** lives in `config/` (environments, thresholds, monitoring).
- **Question banks** live in `question_banks/`.

## Branching

Cut a branch off `main`. Use a descriptive, prefixed name:

```text
feat/<slug>      # new capability
fix/<slug>       # bug fix
docs/<slug>      # documentation
```

## Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add cost anomaly detection to interaction quality engine
fix: SV eval 0% — Cortex Analyst response-shape mismatch
docs: update CI pipeline wiring guide for GitLab
```

Write the body to explain the *why*, not just the *what*.

## Pull requests

1. Open a PR into `main`.
2. Keep a PR scoped to one concern. Prefer several small, independently mergeable
   PRs over one large one.
3. CI must be green before merge (see below).
4. PRs are **squash-merged**, so the PR title becomes the commit on `main`.

## CI gates

CI pipeline examples live in `ci/github/`. The pipeline stages are:

| Stage | Script | Purpose |
|-------|--------|---------|
| Audit | `python evaluation/audit_semantic_view.py` | Structural checks (free) |
| Evaluate | `python evaluation/evaluate_semantic_view.py` | LLM-judged accuracy |
| Agent eval | `python evaluation/audit_agent.py` | Native GPA evaluation |
| Deploy | `python setup/deploy.py` | Promote to production |

See [ci/README.md](ci/README.md) for full pipeline documentation and how to wire
these into GitHub Actions, GitLab CI, or any other CI system.

## Local development

- Python deps: `pip install -r requirements.txt`
- Snowflake connection: configure a named connection in `~/.snowflake/connections.toml`
  and set `connection_name` in `config/environments.yaml`.
- For headless/CI: set `SNOWFLAKE_ACCOUNT` / `SNOWFLAKE_USER` / `SNOWFLAKE_PRIVATE_KEY`.
- Run an evaluation:

  ```bash
  python evaluation/evaluate_semantic_view.py --environment dev
  ```

- Cost: evaluations consume Snowflake AI Credits. See
  [docs/reference/cost-model.md](docs/reference/cost-model.md) before running large banks.

## License

This project is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE)
and [NOTICE](NOTICE). By submitting a Contribution, you agree that it is provided
under the terms of that license.
