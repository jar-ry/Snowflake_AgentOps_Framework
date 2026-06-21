# Documentation Cleanse — README.md + docs/

Scope: `README.md` and everything under `docs/` (index, 3 pillar explanations, cost-model reference). Out of scope this round: `AGENT.md`, `ci/README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.

## Part 1 — Evaluation: necessary, slop, or redundant

### README.md (284 lines)
| Section | Verdict | Reasoning |
|---|---|---|
| Title + intro (1-3) | **Keep** | Tight elevator pitch. |
| What This Does (7-13) | **Keep** | Best progressive on-ramp in the repo. |
| Architecture mermaid (17-43) | **Keep** | CI/dev-workflow view; distinct from the pillar diagram in docs/. |
| Getting Started / Bootstrap (47-81) | **Keep** | Core path. |
| Manual Setup (82-111) | **Fix slop** | The `python -c "... # Execute each statement..."` block (102-108) doesn't actually run — it's a misleading stub. Replace with accurate steps (or point at the bootstrap skill / a real runner). |
| Directory Structure (115-170) | **Trim** | 55-line file-by-file tree (every Next.js page, every `.py`) is too granular for the entry README and duplicates the tree in `AGENT.md`. Slim to top-level dirs + one-line purpose. |
| Run Evaluations Locally (174-194) | **Redundant** | Byte-for-byte duplicate of the command list in `AGENT.md`. Decision needed on canonical home (see Part 3). |
| Monitoring → Schedules table (202-208) | **Redundant** | Duplicates the daily-tasks table in pillar-3 (which has more detail). |
| Monitoring → Alerts table (210-220) | **Redundant** | Duplicates pillar-3's alerts table (pillar-3 also has severity logic). |
| Monitoring → Dashboard (222-230) | **Keep** | Deploy command lives nowhere else. |
| CI/CD Pipeline (234-241) | **Keep** | Already a short summary + link to ci/README. |
| Configuring Thresholds YAML (245-261) | **Redundant** | Duplicates the thresholds YAML in pillar-2. |
| Documentation table (265-274) | **Keep** | Good index (fixed last round). |
| Contributing / License (278-284) | **Keep** | Standard. |

### docs/README.md (59 lines)
| Section | Verdict |
|---|---|
| Org table, pillar list + diagram, Reference list | **Keep** — this is the map. |
| Documentation conventions (46-57) | **Trim/relocate** — contributor-facing meta, not framework logic; condense to ~2 lines or move to CONTRIBUTING (out of scope, so condense here). |

### Pillar docs + cost-model
- **pillar-1** (55 lines): **Keep as-is.** Best doc — has the honest "gap / where it's headed" section.
- **pillar-2** (164): **Keep**, becomes canonical home for thresholds YAML + eval cost summary. No internal redundancy.
- **pillar-3** (136): **Keep**, becomes canonical home for schedules + alerts tables.
- **cost-model** (144): **Keep.** pillar-2's short "Cost considerations" (148-156) is an acceptable summary+link, not a true duplicate — leave it.

## Part 2 — Redundancy removal (canonical-home assignments)

The rule: each fact lives in exactly one place; everywhere else links to it.

1. **Alerts** → canonical = pillar-3. In README, replace the 7-row table with one sentence ("7 Snowflake Alerts cover feedback, accuracy, latency, cost, errors, health, and interaction quality") + link to pillar-3.
2. **Daily schedules** → canonical = pillar-3. In README, drop the table; fold into the same one-line monitoring summary + link.
3. **Eval thresholds YAML** → canonical = pillar-2. In README "Configuring Thresholds", cut the YAML block; keep one line ("Quality gates are configured in `config/thresholds.yaml`") + link to pillar-2.
4. **Directory tree** → slim README to top-level dirs only (the exhaustive tree stays in `AGENT.md`).
5. **Documentation conventions** in docs/README → condense to 2 lines.

Net effect: README drops from ~284 to ~190 lines with no information loss (everything cut is preserved in its canonical doc).

## Part 3 — One decision needed (handled at approval)
**"Run Evaluations Locally" command list** is duplicated in README and AGENT.md. Options:
- (a) Keep in README (humans look here first), accept the AGENT.md copy — lowest effort.
- (b) Move it into a new `docs/how-to/` guide and have README link to it — cleaner, and seeds the missing How-to section (Part 4).

Default assumption in this plan: **(b)** if you approve the gap-filling phase; otherwise **(a)**.

## Part 4 — Gaps identified (for your call; not auto-filled)

1. **No Tutorials / How-to mode.** docs/ has only Reference + Explanation (2 of Diátaxis's 4). There's no "your first governed agent" walkthrough — and `agents/` + `semantic_views/` ship empty, so a newcomer has no guided first run. **Biggest gap.**
2. **No concepts narrative.** Nothing explains, in plain terms, how Semantic View → Agent → Evaluation → Monitoring connect before the reader is dropped into per-pillar detail.
3. **No glossary.** GPA, VQR, OOS, semantic view, Cortex Analyst, question bank are used undefined — friction for "understanding the logic."
4. **Inconsistent limitations sections.** pillar-1 candidly states its gap/roadmap; pillar-2 and pillar-3 have no equivalent "what this does NOT do" section.

## Execution order
1. README: fix Manual Setup slop; slim directory tree.
2. README: collapse Monitoring tables → summary+link; collapse Thresholds YAML → link.
3. docs/README: condense conventions section.
4. (If gap phase approved) create `docs/how-to/first-evaluation.md`, move local commands there, link from README + docs/README; optionally add concepts intro + glossary + pillar limitations.
5. Re-verify all internal links resolve; report final line-count delta.

## Notes
- Redundancy removal (Parts 1-3) is safe and reversible; recommend doing it regardless.
- Gap-filling (Part 4) is additive new writing — approve all, some, or none.
