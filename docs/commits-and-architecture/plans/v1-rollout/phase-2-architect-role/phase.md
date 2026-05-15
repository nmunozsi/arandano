> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/phase.md`
>
> **Folder structure:**
>
> ```
> phase-2-architect-role/
> ├── phase.md   ← you are here
> ├── T1-config-schema.md
> ├── T2-architecture-template.md
> ├── T3-architect-skill.md
> ├── T4-synthesize-architect-task.md
> ├── T5-wire-orchestrator.md
> ├── T6-cli-flags.md
> ├── T7-stack-template-config-and-arch.md
> ├── T8-seed-monorepo-architecture.md
> ├── T9-worker-architect-driver.md
> ├── T10-rebuild-worker-image.md
> ├── T11-migrate-node-ts-toy.md
> └── T12-e2e-two-task-plan.md
> ```

# Phase 2 — Architect role + live architecture.md

**Goal:** Add a third built-in role (`architect`) that auto-spawns at the end of every full-plan run, edits `docs/architecture.md` using a minimal-diff template, and opens a single PR per plan.

**Ordering rule (non-negotiable):** Phase 1 must be complete (worker rebuilt with gitmoji skill, lint at error). All commits in Phase 2 follow the new convention.

**Architecture of the change:**

- New types + zod schema for the `architect:` role config.
- A new `synthesizeArchitectTask` function mirroring `synthesizeReviewerTask`.
- Orchestrator hooks the synthesis at end-of-plan (after all reviewer expansion).
- CLI flags `--with-architect` / `--no-architect` thread through `OrchestratorOpts`.
- Worker driver gains an `architect` branch alongside the existing `reviewer` branch.
- Architecture template + skill ship as plain assets bundled into both the templates package and the worker image.
- `docs/architecture.md` in the monorepo is seeded by hand from `docs/initial-build/spec.md`.
- `node-ts-toy` migration in T11 mirrors what `arandano init` would scaffold today.

## Tasks

- [ ] [T1 — config schema for architect role](T1-config-schema.md)
- [ ] [T2 — architecture.md template asset](T2-architecture-template.md)
- [ ] [T3 — architect skill](T3-architect-skill.md)
- [ ] [T4 — synthesizeArchitectTask + tests](T4-synthesize-architect-task.md)
- [ ] [T5 — wire architect synthesis into Orchestrator](T5-wire-orchestrator.md)
- [ ] [T6 — --with-architect / --no-architect CLI flags](T6-cli-flags.md)
- [ ] [T7 — stack templates: config block + arch skeleton](T7-stack-template-config-and-arch.md)
- [ ] [T8 — seed docs/architecture.md in the monorepo](T8-seed-monorepo-architecture.md)
- [ ] [T9 — worker architect driver](T9-worker-architect-driver.md)
- [ ] [T10 — rebuild worker image and confirm GHCR push](T10-rebuild-worker-image.md)
- [ ] [T11 — migrate node-ts-toy](T11-migrate-node-ts-toy.md)
- [ ] [T12 — e2e two-task plan against node-ts-toy](T12-e2e-two-task-plan.md)
