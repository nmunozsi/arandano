> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/phase.md`
>
> **Folder structure:**
>
> ```
> phase-1-commit-conventions/
> ├── phase.md   ← you are here
> ├── T1-commitlint-rule-pack.md
> ├── T2-gitmoji-commits-skill.md
> ├── T3-vendor-into-worker.md
> ├── T4-rebuild-worker-image.md
> ├── T5-monorepo-flip-to-warn.md
> ├── T6-stack-template-flip.md
> ├── T7-update-docs.md
> ├── T8-monorepo-flip-to-error.md
> └── T9-e2e-node-ts-toy.md
> ```

# Phase 1 — Commit conventions

**Goal:** Land the `:emoji: type(scope): subject` convention everywhere — monorepo root, all three stack templates, and the worker — without ever letting the worker's own commits fail the new rule.

**Ordering rule (non-negotiable):**

1. Ship the rule pack + the worker skill (T1–T3).
2. Rebuild and publish the worker image (T4).
3. Flip the monorepo lint to **warn** (T5) so we can validate that commits the worker writes are actually shaped correctly.
4. Update the stack templates (T6) and docs (T7).
5. Flip the monorepo lint to **error** (T8) once T5 has confirmed worker output passes.
6. e2e on `node-ts-toy` (T9) — final gate.

## Tasks

- [x] [T1 — commitlint rule pack](T1-commitlint-rule-pack.md)
- [x] [T2 — gitmoji-commits skill](T2-gitmoji-commits-skill.md)
- [x] [T3 — vendor rule pack + skill into worker](T3-vendor-into-worker.md)
- [x] [T4 — rebuild worker image and confirm GHCR push](T4-rebuild-worker-image.md)
- [x] [T5 — flip monorepo lint to warn](T5-monorepo-flip-to-warn.md)
- [x] [T6 — flip stack templates](T6-stack-template-flip.md)
- [x] [T7 — update CLAUDE.md and CONTRIBUTING.md](T7-update-docs.md)
- [x] [T8 — flip monorepo lint to error](T8-monorepo-flip-to-error.md)
- [x] [T9 — e2e on node-ts-toy](T9-e2e-node-ts-toy.md)
