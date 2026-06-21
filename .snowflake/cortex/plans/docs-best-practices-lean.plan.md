# Docs best-practices + leanness pass

Files in scope: `README.md`, `AGENT.md`, `docs/README.md`, `docs/explanation/pillar-{1,2,3}-*.md`, `docs/reference/cost-model.md`, `docs/how-to/run-evaluations-locally.md`.

Verified against code first (so no accuracy fixes are needed this round): 7 alerts, 3 tasks, the table/view names in AGENT.md, and the default model `claude-opus-4-7` all match `setup/00_framework_tables.sql` and `config/defaults.yaml`.

## Findings

### AGENT.md — biggest leanness target (156 lines)
This file duplicates a lot that now lives canonically elsewhere, and even duplicates itself:
- **Two YAML config blocks** (lines 23-28 and 98-122) show the same `framework:` shape twice — intra-file redundancy.
- **Eval Pipeline (Two Layers)** (131-138) restates pillar-2 / README.
- **CI/CD** (148-155) restates `ci/README.md` and README.
- **Config Resolution + Config Format** (87-122) are two sections covering one topic.

What is genuinely AGENT-specific and must stay: the **Conventions** list, the **"What the framework creates" object inventory** (a fast agent lookup, not duplicated elsewhere), the **full file-by-file directory tree** (README now delegates here for detail), the **Observability span/token-field internals** (124-129, high-signal, unique), and the **Connection pattern**.

### README.md (183 lines) — mostly good after prior passes
- **Heading case** is Title Case ("What This Does", "Run Evaluations Locally", "Configuring Thresholds"), which contradicts the repo's own documented convention ("Sentence-case headings", `docs/README.md`).
- Otherwise lean; no content cuts proposed.

### docs/README.md
- The pillar list uses Title Case link text ("Pillar 1: Input **Governance**") that does not match the actual doc H1s ("Pillar 1: Input **governance**"). Link text should match titles.

### Pillar docs + cost-model — leave largely alone
- pillar-1 is exemplary; pillar-2 and pillar-3 are dense but reference-style and earn their length; cost-model's length is justified for a reference. **No structural cuts.** Only light heading-case normalization where a section heading is clearly Title Case (e.g. pillar-2 "Semantic View Evaluation" → "Semantic view evaluation"), and a review-date bump only if otherwise edited.

## Proposed changes

### Phase 1 — AGENT.md de-duplication (the real lean)
1. Merge the two YAML blocks into the single full example; delete the partial one.
2. Merge "Config Resolution" + "Config Format" into one "Configuration" subsection.
3. Replace the "Eval Pipeline (Two Layers)" prose with a 2-line script→purpose map + a pointer to `docs/explanation/pillar-2-output-evaluation.md`.
4. Replace the "CI/CD" prose with a one-line pointer to `ci/README.md` (keep the 3 stage names).
5. Keep Conventions, object inventory, full directory tree, Observability internals, Connection pattern unchanged.
6. Add one line reconciling "Two Layers" with the "three pillars" framing used in docs/.
- Expected: AGENT.md ~156 → ~110 lines, no loss of agent-relevant signal.

### Phase 2 — Heading-case consistency (repo convention = sentence case)
7. Normalize README headings to sentence case (e.g. "What this does", "Getting started", "Run evaluations locally", "Directory structure", "Monitoring & observability", "CI/CD pipeline", "Configuring thresholds", "Documentation", "Contributing", "License").
8. Normalize AGENT.md section headings to sentence case.
9. Fix docs/README pillar link text to match the real doc titles (sentence case after the colon).
10. Light-touch: fix obvious Title-Case section headings inside pillar-2 / pillar-3 (e.g. "Semantic View Evaluation", "Agent Evaluation", "Trend views" is already fine). No body rewrites.

### Phase 3 — Hygiene
11. Bump `Last reviewed:` to 2026-06-21 on any docs/ file whose content I change (docs/README at minimum; pillars only if Phase 2 touches them).
12. Re-validate all relative links + heading anchors after renames (heading renames change anchors — re-check the README link in pillar-2 `#quality-gates-in-ci` and any cross-links that target renamed headings).
13. Report final per-file line-count delta.

## One decision for you
**Heading-case normalization (Phase 2)** touches many headings and is a style preference. The repo *documents* sentence case as the convention, so aligning is the "best practice" call — but it is churn. Options at approval:
- Do Phase 2 across all in-scope files (recommended for consistency).
- Limit Phase 2 to docs/README link-text fix only (skip README/AGENT/pillar heading renames).
- Skip Phase 2 entirely (do only the AGENT.md lean in Phase 1).

## Explicitly NOT doing
- No rewrites of pillar explanations or the cost model (they are already lean/correct).
- No new content (tutorial/concepts/glossary remain the deferred gaps from the prior plan).
- No badges/TOC additions (avoids noise).

## Risk
Low. Heading renames are the only thing that can break intra-repo anchor links; Phase 3 step 12 explicitly re-validates those before finishing.
