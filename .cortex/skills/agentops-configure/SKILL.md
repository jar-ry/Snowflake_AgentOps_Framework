---
name: agentops-configure
description: Select which AgentOps framework modules (core, evaluation, monitoring, alerts, automation, dashboard) to install, uninstall, or reconfigure, and which dashboard pages to expose. Use when a customer wants only part of the framework (e.g. "dashboard and tables but no CI/CD", "monitoring only, no alerts or tasks", "add alerts to my existing install", "turn off the cost page"). Drives setup/install.py (the manifest-based installer) and writes ENABLED_PAGES in app/lib/agentops.config.ts. Triggers - configure agentops, choose modules, install only, modular install, enable module, disable module, remove module, uninstall module, which pages, dashboard pages, turn off page, agentops-configure.
---

# AgentOps Configure (modular install / reconfigure)

The framework is split into six capability modules declared in `modules.yaml`.
This skill helps a customer pick exactly what to deploy and drives the
dependency-aware installer `setup/install.py`. Use it for a fresh selective
install, to add/remove a module later, or to toggle dashboard pages.

Do NOT hand-write DDL or hand-edit module SQL. Always go through
`setup/install.py`, which resolves dependencies, orders execution, and records
state in `.agentops-installed.yaml`.

## The modules (capability-level)

| Module | What it installs | Depends on |
|---|---|---|
| core | schema + observability views | (always installed) |
| evaluation | eval tables + accuracy view + CI/CD assets (the "devops") | core |
| monitoring | monitoring tables + trend/quality/dashboard views | core |
| alerts | Snowflake alerts on regressions | monitoring |
| automation | scheduled aggregation tasks | monitoring |
| dashboard | Next.js App Runtime dashboard (per-page toggles) | monitoring |

`core` is always installed. Dependencies are auto-included: choosing `dashboard`
pulls in `monitoring` and `core`. The accuracy-regression alert is applied only
when BOTH `alerts` and `evaluation` are selected.

## Workflow

### Step 1: Determine current state

Run the installer's list command to see what's available and already installed:

```bash
python setup/install.py --list
```

If `.agentops-installed.yaml` exists, this is a reconfigure (add/remove modules).
Otherwise it's a fresh selective install. Confirm `config/environments.yaml`
exists with `framework.database` / `framework.schema` / `framework.warehouse`
(the `bootstrap-from-existing` skill creates it). If it does not exist, tell the
user to run `bootstrap-from-existing` first, or that you can capture the values
now and write the config.

### Step 2: Ask which modules to install

Use `ask_user_question` (type: options, `multiSelect: true`), titled "Modules".
Offer the five optional modules (omit `core` - it is always included):

- **Evaluation & CI/CD** - semantic-view / agent quality gates in CI. Skip if the customer does not want the devops layer.
- **Runtime monitoring** - usage/cost, feedback, and quality tables + views. Foundation for alerts, automation, and dashboard.
- **Alerts** - Snowflake alerts on regressions (needs monitoring + a warehouse).
- **Automation** - scheduled tasks that populate the monitoring tables daily (needs monitoring + a warehouse).
- **Dashboard** - the Next.js monitoring app (needs monitoring).

Pre-select all five by default. After they answer, compute the resolved set
(add dependencies) and tell the user plainly, e.g. "You chose dashboard, so
monitoring and core are included automatically."

Common recipes to offer if they are unsure:
- Dashboard + data, no devops: `monitoring, dashboard`
- Monitoring tables only: `monitoring`
- Full framework: `all`

### Step 3: If dashboard selected, ask which pages

Use `ask_user_question` (multiSelect), titled "Dashboard pages". Offer the pages
from `modules.yaml` under `dashboard.pages`:

- Overview (needs monitoring)
- Accuracy (needs evaluation)
- Quality (needs monitoring)
- Cost (needs monitoring)
- Feedback (needs monitoring)
- Alerts (needs alerts)
- Settings (needs monitoring; edits the LLM feedback assessment — prompt/model/sampling always apply, schedule needs automation)

Pre-select only pages whose `requires_modules` are all in the resolved module
set. If the customer picks a page whose required module is NOT selected (e.g.
Accuracy without evaluation), warn them the page will render a
"module not installed" notice and either add the module or drop the page.

### Step 4: Run the installer

Build the comma-separated module list from the user's selection (dependencies
are resolved by the installer, so passing just the top-level choices is fine).
Preview first, then apply:

```bash
python setup/install.py --modules <selected> --dry-run
python setup/install.py --modules <selected>
```

For a reconfigure that REMOVES a module, use uninstall (reverse-dependency safe):

```bash
python setup/install.py --uninstall --modules <module>
# add --cascade only if the user accepts dropping dependents too
```

Report which objects were created/dropped and the resulting installed set
(the installer prints this and updates `.agentops-installed.yaml`).

### Step 5: Write dashboard page config

If `dashboard` is installed, edit `app/lib/agentops.config.ts` so `ENABLED_PAGES`
lists exactly the pages chosen in Step 3 (keep `overview` unless the user
explicitly drops it). Example:

```ts
export const ENABLED_PAGES: PageKey[] = ["overview", "cost", "feedback"]
```

Disabled pages disappear from the nav and render the not-installed notice if
opened directly. Also confirm `FRAMEWORK_DB` / `FRAMEWORK_SCHEMA` are set to the
framework location (the bootstrap skill sets these).

### Step 6: Deploy / redeploy the dashboard (only if dashboard installed)

```bash
cd app && snow app deploy
```

If the app was already deployed, a redeploy picks up the new `ENABLED_PAGES`.
Automation tasks are created SUSPENDED - remind the user to
`ALTER TASK ... RESUME` the three tasks (or resume via Snowsight) if they
installed `automation`.

### Step 7: Report

Summarize:
- Modules installed / removed (with auto-included dependencies)
- Objects created or dropped (from the installer output)
- Dashboard pages enabled (if applicable) and whether a redeploy is needed
- Any warehouse requirement reminders (alerts/automation)

## Notes

- The installer is idempotent: SQL uses `CREATE ... IF NOT EXISTS` / `CREATE OR
  REPLACE`, so re-running is safe.
- Never edit `modules/**/sql/*.sql` to "turn off" a piece - selection is done by
  choosing modules and (for the dashboard) `ENABLED_PAGES`.
- Uninstalling `monitoring` while `alerts`/`automation`/`dashboard` are installed
  is blocked unless `--cascade` is passed - the installer will tell you.
