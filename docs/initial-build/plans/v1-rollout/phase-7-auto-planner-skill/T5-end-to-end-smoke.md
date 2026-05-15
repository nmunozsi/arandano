> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/T5-end-to-end-smoke.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md
> ├── T1-author-the-skill-markdown.md
> ├── T2-validate-task-tree-helper.md
> ├── T3-arandano-plan-decompose-plan-md-command.md
> ├── T4-inject-the-skill-into-the-worker-image.md
> └── T5-end-to-end-smoke.md                                 ← you are here
> ```

### Task 5: End-to-end smoke

**Goal:** Author a real plan in the `node-ts-toy` example and let `arandano plan decompose` produce the tasks; then dispatch them with `arandano run --plan`.

- [ ] **Step 1: Write a small plan**

In `arandano-examples/node-ts-toy/planning/plans/2026-05-08-string-utils-plan.md`:

```markdown
# String utilities — Plan

Add three colocated, tested string helpers behind a clean module API:

1. `src/greet.ts` exporting `greet(name) => "hello, <name>"`.
2. `src/upper.ts` exporting `upper(s) => s.toUpperCase()`.
3. `src/title.ts` exporting `title(s)` (capitalize each whitespace-separated word). Uses `upper` from step 2.

Follow the existing TDD pattern in this repo (test first, colocated `*.test.ts`).
```

- [ ] **Step 2: Run the decomposer**

```bash
cd arandano-examples/node-ts-toy
arandano plan decompose planning/plans/2026-05-08-string-utils-plan.md
```

Expected: `.arandano/tasks/2026-05-08-string-utils/T1-*.md`, `T2-*.md`, `T3-*.md` are created with sensible `depends_on` values; the validator prints "validated tasks under …".

- [ ] **Step 3: Run the plan**

```bash
arandano run --plan=2026-05-08-string-utils
```

Expected: three PRs open with all gates green.

- [ ] **Step 4: Commit and document**

In the examples repo, add the produced tasks (and their PR links) to README.

```bash
git add .
git commit -m "feat(toy): plan + auto-decomposed tasks for string utils"
```

---
