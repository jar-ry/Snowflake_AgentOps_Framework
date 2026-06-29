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
| `--check` | **CI drift guard.** Compare live objects to the committed `.yaml` without writing; exit non-zero if any object has drifted. No-op (exit 0) when no objects are configured. See below. |

## How it captures each object type

- **Semantic views:** `SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW(<fqn>)` — Snowflake's native, lossless YAML export (includes tables, relationships, facts, metrics, dimensions, and verified queries).
- **Agents:** `DESCRIBE AGENT <fqn>` returns the spec as JSON, which is converted to YAML. The file holds the pure spec; `deploy.py` re-wraps it in `CREATE OR REPLACE AGENT` at deploy time using the FQN and comment from `config/environments.yaml`.

## Good to know

- **Read-only.** The script only runs `SELECT` / `DESCRIBE` against Snowflake. It never modifies your account — the only thing it changes is local files.
- **Deterministic.** Re-running with no Snowsight change produces no git diff, so a diff always reflects a real edit.
- **Fails loudly.** If a configured object is missing or inaccessible, the script prints a clear error and exits non-zero rather than writing an empty file.

## CI drift guard (`--check`)

The capture step only helps if people actually run it. The drift guard enforces that: it catches the case where someone edits an object in Snowsight but never captures the change into git, so the committed `.yaml` silently goes stale (and the next deploy would overwrite their edit).

```bash
python evaluation/sync_from_snowflake.py --environment dev --check
```

`--check` re-exports each live object and compares it to the committed file **without writing anything**. Because it reuses the exact serialization that capture would write, an unchanged object always matches — there are no false positives from formatting or key order. It reports `UNCHANGED`, `DRIFTED`, or `MISSING` (no committed file yet) per object, and:

- **exits `0`** when everything is in sync (or nothing is configured), or
- **exits `1`** when any object has drifted, naming the object and the command to fix it.

This wires into the pipelines with different strictness:

| Pipeline | Behavior | Why |
| --- | --- | --- |
| **CI** (`ci.yml`, on PR/branch push) | **Fails the build** on drift, before the evals run | Don't evaluate or merge a definition that doesn't match live. Cheap to fix pre-merge, so blocking is appropriate. |
| **CD** (`cd.yml`, on merge to main) | **Manual-approval gate** on the `prod` environment before deploy | At deploy time the committed release is *meant* to differ from live PROD, so a drift *warning* is either a no-op (empty prod lists) or fires on every release. The honest control for "about to overwrite live PROD" is a human approval, configured via the GitHub `prod` environment's required reviewers. |

> **Set up the approval gate.** In the repo, go to **Settings → Environments → `prod`** and add **Required reviewers**. Until reviewers are configured, the `environment: prod` declaration is inert (the deploy runs unattended).

> **Future enhancement — out-of-band prod drift.** A genuinely useful prod-side drift check compares live PROD against the *last-deployed* state (not the about-to-deploy HEAD), to catch someone hotfixing PROD in Snowsight outside the pipeline. That requires tracking the last-deployed baseline and is tracked separately.

To resolve a CI drift failure, run the capture and commit the result:

```bash
python evaluation/sync_from_snowflake.py --environment dev
git add semantic_views/ agents/ && git commit -m "capture Snowsight edits"
```

> **Shared-dev caveat.** Because Stage 1 checks against the shared `dev` environment, a concurrent Snowsight edit by another developer can make the guard fail on a PR that didn't touch that object. This is the same shared-environment limitation noted below; per-developer isolation (Stage 2) removes it.

## Limitation: shared dev environment

Stage 1 captures from the shared `dev` environment defined in `config/environments.yaml`. If several developers edit the **same** object in Snowsight at the same time, the last person to capture wins — concurrent edits are not isolated. For teams that need per-developer isolation, see the Stage 2 roadmap item (per-developer environments).

### How this interacts with the drift guard

Because the guard compares your committed `.yaml` against the **shared** live `dev`, another developer's change to that shared environment can make the guard fail your PR. Two cases:

- **A different object changed.** The guard checks *all* configured objects, so if a teammate's change to `agent_B` merged to `main` while your branch still has the old `agent_B`, your PR fails on `agent_B` even though you only touched `agent_A`. **Fix:** rebase your branch on `main` to pick up their captured change. Nothing is lost.
- **The same object changed.** If you and a teammate both edited the same object in Snowsight, that is a true conflict at the source (Snowsight is last-write-wins). The guard surfaces it as a failed build instead of silently evaluating/deploying the wrong definition. **Fix:** reconcile the two edits, re-capture, and commit.

**Important:** the guard never discards your work — your changes live in the committed `.yaml` on your branch. A failed build blocks the PR until you reconcile (rebase or merge); it does not force you to start over. The clean solution to both cases is per-developer sandboxes (Stage 2 / #27), where each developer edits their own copy and the guard compares against *their* environment, removing cross-developer false failures entirely.
