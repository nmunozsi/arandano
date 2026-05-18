> **Location:** `docs/commits-and-architecture/plans/v1-rollout/plan.md`
>
> **Folder structure:**
>
> ```
> v1-rollout/
> ├── plan.md          ← you are here
> ├── phase-1-commit-conventions/
> └── phase-2-architect-role/
> ```

# Commits & Architecture — v1 Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the gitmoji-on-top-of-Conventional-Commits commit convention across the arandano monorepo and every scaffolded client project, and introduce a new `architect` worker role that refreshes `docs/architecture.md` at the end of every full-plan run.

**Architecture:** Two ordered phases. Phase 1 teaches the worker the new commit convention via a bundled skill, rebuilds the worker image, then flips the lint rule on (worker-before-rule ordering is critical). Phase 2 introduces the new role, scaffolds the architecture template, and wires auto-spawn + CLI flags. Each phase ends with a real e2e run against `node-ts-toy`.

**Tech Stack:** TypeScript / Node 22 / oclif (CLI), Vitest (tests), `@commitlint/config-conventional` + a custom rule pack (linter), Docker + GHCR (worker image), Claude Code (worker LLM), `gh` (PR creation).

---

## Phases

- [x] [phase-1 — commit conventions](phase-1-commit-conventions/phase.md)
- [x] [phase-2 — architect role + live architecture.md](phase-2-architect-role/phase.md)

## Cross-phase invariants

- Worker image is rebuilt and pushed BEFORE any new commitlint rule is enabled at the consumer side. Order in Phase 1 enforces this. Order in Phase 2 enforces it for the architect skill.
- All commits in this plan use the new convention. The first task of Phase 1 produces the rule pack; subsequent task commits inside Phase 1 _cannot_ use gitmoji until step 5 of Phase 1 flips the monorepo rule. To avoid a chicken-and-egg, the lint rule is flipped to _warn_ mode at first commit and to _error_ at the end of Phase 1 (see phase-1).
- Out-of-scope cleanups (refactors of unrelated files, dependency bumps not required by the spec) are forbidden. If a task discovers one, append a `- [ ]` line to this `plan.md` under "Follow-ups" and move on.

## Follow-ups (filled in during execution)

- [x] [F1 — set ARANDANO_PLAN_SLUG + ARANDANO_PLAN_MERGE_RANGE for T-architect container](phase-2-architect-role/F1-architect-env-vars.md)
- [x] [F2 — use plan-scoped or globally-unique task IDs in node-ts-toy e2e plans](phase-2-architect-role/F2-unique-task-ids.md)
