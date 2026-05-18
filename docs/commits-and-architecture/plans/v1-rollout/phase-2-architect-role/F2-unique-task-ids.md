> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/F2-unique-task-ids.md`

---

id: F2
title: Ensure globally-unique task IDs in node-ts-toy e2e plans
role: coder
tdd: relaxed
depends_on: []

---

# F2 — Globally-unique task IDs across all node-ts-toy plan folders

**Found in:** T12 e2e run (2026-05-18). T1 in arch-smoke ran the wrong task because
`findTaskMd` uses a glob `T1-*.md` across the entire `.arandano/` tree and picked the old
`helpers/plans/2026-05-08-add-greet/T1-*.md` instead of `arch-smoke/plans/smoke/T1-add-helper.md`.

The `CLAUDE.md` rule already says: _"Task IDs must be unique across all plan folders."_
The arch-smoke plan violated it by reusing T1 and T2.

**Fix options (pick one):**

1. **Rename arch-smoke tasks** — rename `T1-add-helper.md` → `AS1-add-helper.md` and
   `T2-add-second-helper.md` → `AS2-add-second-helper.md`; update `id:` in frontmatter
   and the `plan.md` checklist. Rerun the e2e.
2. **Fix findTaskMd to be plan-scoped** — when the Orchestrator knows the plan folder,
   pass it to `runOne` so `findTaskMd` only searches within that folder. This is the
   correct long-term fix and prevents the problem from recurring.

**Recommendation:** Do both — rename for the immediate e2e and fix `findTaskMd` for the long term.

**Acceptance:**

- `arandano run --spec=arch-smoke --plan=smoke` dispatches `archSmokeOne` and `archSmokeTwo`
  (visible in the container journal's `task:` line).
- No task ID collision occurs even if another plan also uses T1.
