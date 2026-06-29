# Sync edits from Snowsight into git

> Status: Stable | Last reviewed: 2026-06-27 | Audience: Engineers

**Purpose.** Show how to pull changes you made to a semantic view or agent in the Snowsight UI back into the git repo, so they can be reviewed, evaluated, and deployed through the framework.

## Why this exists

You edit agents and semantic views where it's natural — in **Snowsight**. But the framework treats **git** as the source of truth: CI evaluates the committed `.yaml` files and CD deploys them. Those two worlds need a bridge.

`sync_from_snowflake.py` is that bridge. It pulls the current live definition out of Snowflake and writes it to the repo, so your UI edit becomes a normal, reviewable git change.

It is the inverse of `setup/deploy.py`:

| Direction | Script |
| --- | --- |
| git → Snowflake (deploy) | `setup/deploy.py` |
| Snowflake → git (capture) | `evaluation/sync_from_snowflake.py` |

## The workflow

```text
Edit in Snowsight  →  sync_from_snowflake.py  →  git diff  →  commit  →  PR  →  CI  →  CD
```

1. **Edit in Snowsight.** Open AI & ML → Agents (or your semantic view), make your change, and save. The live object now differs from what's in git.

2. **Pull the change into git:**

   ```bash
   python evaluation/sync_from_snowflake.py --environment dev
   ```

   This reads the objects listed under `environments.dev` in `config/environments.yaml`, captures each one from Snowflake, and writes:
   - `semantic_views/<short_name>.yaml`
   - `agents/<short_name>.yaml`

3. **Review the diff.** Your Snowsight edit appears as a clean YAML change:

   ```bash
   git diff agents/<short_name>.yaml
   ```

4. **Commit and open a PR.** CI evaluates the new definition; on merge, CD deploys it.

## Options

| Flag | Purpose |
| --- | --- |
| `--environment dev` | Which environment block in `config/environments.yaml` to capture from. Use `dev` for normal authoring. |
| `--target semantic_view \| agent \| all` | Limit the capture to one object type. Defaults to `all`. |
| `--dry-run` | Show what *would* change (`WROTE` / `UNCHANGED` / `WOULD CHANGE`) without writing files. |

## How it captures each object type

- **Semantic views:** `SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW(<fqn>)` — Snowflake's native, lossless YAML export (includes tables, relationships, facts, metrics, dimensions, and verified queries).
- **Agents:** `DESCRIBE AGENT <fqn>` returns the spec as JSON, which is converted to YAML. The file holds the pure spec; `deploy.py` re-wraps it in `CREATE OR REPLACE AGENT` at deploy time using the FQN and comment from `config/environments.yaml`.

## Good to know

- **Read-only.** The script only runs `SELECT` / `DESCRIBE` against Snowflake. It never modifies your account — the only thing it changes is local files.
- **Deterministic.** Re-running with no Snowsight change produces no git diff, so a diff always reflects a real edit.
- **Fails loudly.** If a configured object is missing or inaccessible, the script prints a clear error and exits non-zero rather than writing an empty file.

## Limitation: shared dev environment

Stage 1 captures from the shared `dev` environment defined in `config/environments.yaml`. If several developers edit the **same** object in Snowsight at the same time, the last person to capture wins — concurrent edits are not isolated. For teams that need per-developer isolation, see the Stage 2 roadmap item (per-developer environments).
