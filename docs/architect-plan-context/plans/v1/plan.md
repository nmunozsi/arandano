> **Location:** `docs/architect-plan-context/plans/v1/plan.md`
>
> **Folder structure:**
>
> ```
> v1/
> ├── plan.md                          ← you are here
> ├── T1-runone-result-backprop.md
> ├── T2-orchestrator-plan-context.md
> ├── T3-architect-driver-context.md
> ├── T4-skill-md-lazy-fetch.md
> └── T5-build-and-verify.md
> ```

# Architect plan context — v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the architect worker accurate per-task code-diff context by closing the `result.json → state.json` loop, writing a `plan-context.json` file before architect dispatch, and updating the architect driver and SKILL.md to lazily fetch only the diffs it needs.

**Architecture:** Five ordered tasks across two repos. Tasks 1–2 are in the arandano monorepo (`packages/core`). Tasks 3–4 are in `arandano-worker`. Task 5 builds and verifies the worker image. Each task is independently committable and leaves the system in a working state.

**Tech Stack:** TypeScript / Node 22, Vitest (tests), `node:fs/promises` (I/O), Docker / GHCR (worker image).

---

## Tasks

- [x] [T1 — runOne: back-propagate branch and pr_url from result.json to state.json](T1-runone-result-backprop.md)
- [x] [T2 — Orchestrator: write plan-context.json, inject context env vars, remove gitMergeRange](T2-orchestrator-plan-context.md)
- [x] [T3 — Architect driver: context priority chain, remove mergeRange](T3-architect-driver-context.md)
- [x] [T4 — SKILL.md: add lazy-fetch strategy sections, remove ARANDANO_PLAN_MERGE_RANGE reference](T4-skill-md-lazy-fetch.md)
- [x] [T5 — Build worker and verify](T5-build-and-verify.md)
