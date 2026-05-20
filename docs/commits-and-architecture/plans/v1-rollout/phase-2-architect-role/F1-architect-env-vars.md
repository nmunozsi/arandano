> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/F1-architect-env-vars.md`

---

id: F1
title: Populate ARANDANO_PLAN_SLUG and ARANDANO_PLAN_MERGE_RANGE for T-architect container
role: coder
tdd: strict
depends_on: []

---

# F1 — Pass plan context env vars to the architect container

**Found in:** T12 e2e run (2026-05-18). T-architect defaulted `planSlug='plan'` and `mergeRange=''`
because the Orchestrator never sets `ARANDANO_PLAN_SLUG` or `ARANDANO_PLAN_MERGE_RANGE` in the
container environment.

**Files to modify:**

- `packages/executors-docker/src/containerSpec.ts` — add `ARANDANO_PLAN_SLUG` and
  `ARANDANO_PLAN_MERGE_RANGE` to the env vars set on every container (or only for `T-architect` tasks).
- `packages/core/src/orchestrator/orchestrator.ts` — when synthesizing the architect task, compute the
  merge range (`git merge-base HEAD~N HEAD` where N = number of plan tasks, or the range between the
  run's start SHA and the current HEAD) and store it alongside `planSlug`.
- `packages/core/src/architect/synthesizeArchitectTask.ts` — accept `planSlug` and `mergeRange` in
  `SynthesizeArchitectOpts` so the orchestrator can thread them through.

**Why the merge range is hard to compute at dispatch time:** The orchestrator runs _before_ any
coder tasks commit. The range is only meaningful _after_ all coder tasks have merged their PRs. A
safe approximation is to use `git log --format=%H main..HEAD` at architect dispatch time (i.e., the
commits that exist at that moment after all coder tasks completed). This requires the orchestrator
to shell-out after the main loop completes but before dispatching T-architect.

**Acceptance:**

- `arandano run --plan=smoke` with the arch-smoke plan prints `completed=3 failed=0 skipped=0`.
- The architect container's journal shows `planSlug=smoke` and a non-empty `mergeRange`.
- If there are architectural changes in the plan, the architect opens a PR with title
  `:memo: docs(arch): refresh after smoke`.
