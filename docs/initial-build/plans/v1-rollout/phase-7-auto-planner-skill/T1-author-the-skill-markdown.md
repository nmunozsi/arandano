> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/T1-author-the-skill-markdown.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md
> ├── T1-author-the-skill-markdown.md                        ← you are here
> ├── T2-validate-task-tree-helper.md
> ├── T3-arandano-plan-decompose-plan-md-command.md
> ├── T4-inject-the-skill-into-the-worker-image.md
> └── T5-end-to-end-smoke.md
> ```

### Task 1: Author the skill markdown

**Goal:** A self-contained skill file an agent can read and follow without other context.

**Files:**

- Create: `packages/skills/skills/decomposing-plan-into-tasks/SKILL.md`
- Create: `packages/skills/skills/decomposing-plan-into-tasks/examples/input-plan.md`
- Create: `packages/skills/skills/decomposing-plan-into-tasks/examples/expected-tasks/T1-add-greet.md` (and T2, T3)

- [ ] **Step 1: Author `SKILL.md`**

````markdown
---
name: decomposing-plan-into-tasks
description: Use when given a written plan MD that needs to be turned into one task MD per implementable unit. Produces files under .arandano/tasks/<plan-slug>/T<n>-<slug>.md following the schema in arandano-design.md §14.
---

# Decomposing a plan into tasks

You are reading a plan in `planning/plans/<date>-<slug>-plan.md`. Your job is to turn each section of the plan that names a discrete deliverable into a task MD that arandano can dispatch to a coder.

## Procedure

1. Read the plan in full. Note its slug from the filename: e.g. `2026-05-08-user-auth-plan.md` → slug `2026-05-08-user-auth`.
2. Identify each "unit of work":
   - A unit of work is something a single coder task can complete in 30–60 minutes with one PR at the end.
   - If a section needs more than ~5 commits, split it.
   - If a section is just refactoring docs, group it with the closest implementation task.
3. Number the units `T1`, `T2`, …. Order them by _dependency_, not by order of appearance in the plan.
4. For each unit, write a task MD to `.arandano/tasks/<slug>/T<n>-<short-slug>.md`. Use this exact frontmatter:

```yaml
---
id: T<n>
title: <short imperative — "Implement the user repository", "Add the migration runner">
depends_on: [<earlier task ids that must complete first>]
role: coder
tdd: strict
tests:
  - <one bullet per behavior the task must demonstrate via a failing test first>
acceptance:
  - 'PR opened with description from this file'
  - <other concrete done-when conditions>
quality:
  reviewer_required: true
---
```
````

The body should have:

- `## Context` — 2–4 sentences summarizing what this task achieves and why.
- `## Files likely to change` — bullet list of file paths.
- `## Constraints` — any patterns, conventions, or libraries the coder must follow (link to memory/coding-standards.md if relevant).
- `## Done when` — link back to `tests:` and `acceptance:`.

## Rules

- Every task must satisfy `parseTaskMd` from `@arandano/core` — no extra fields, all required fields present.
- The `depends_on` graph must be acyclic. If you find yourself wanting a cycle, you've split badly: combine the two tasks.
- Don't invent files that don't exist. If the plan is vague about file locations, say so in `## Constraints` rather than guessing.
- Don't write code in the task body. The coder will write code; the task tells them _what_ and _why_, not _how_.

## Verification

After writing the task MDs, run mentally through:

1. Pick a topological order of the tasks. Does each one make sense given that everything before it is merged? If not, fix dependencies.
2. Re-read the plan. For each section, point at exactly one task that implements it. If a section has no task, add one. If a task has no plan section, delete it.
3. The total set of tasks should leave nothing in the plan implicit. The coder should be able to work entirely from the task MD + the workspace CONTEXT.md, without needing to re-read the plan.

````

- [ ] **Step 2: Author the example input plan**

`examples/input-plan.md`:

```markdown
# Add greet utilities — Plan

## Goal

Ship three small string utilities behind a clean module API: `greet`, `uppercase`, `titlecase`.

## Tasks

1. Implement `src/greet.ts` exporting `greet(name)` returning `"hello, <name>"`.
2. Implement `src/uppercase.ts` exporting `upper(s)` returning `s.toUpperCase()`.
3. Implement `src/titlecase.ts` exporting `title(s)` that capitalizes the first letter of each whitespace-separated word. Depends on `upper` from task 2.

Each module should colocate a `*.test.ts` and follow the existing TDD discipline.
````

- [ ] **Step 3: Author the expected task tree**

`examples/expected-tasks/T1-add-greet.md`:

```markdown
---
id: T1
title: Add the greet utility with a colocated test
role: coder
tdd: strict
tests:
  - 'greet("world") returns "hello, world"'
acceptance:
  - 'PR opened with description from this file'
  - 'src/greet.test.ts exists and passes'
quality:
  reviewer_required: true
---

## Context

Implement the first of three small string utilities. This is the simplest one — no dependencies. Use it to verify the colocated test pattern is in place.

## Files likely to change

- src/greet.ts
- src/greet.test.ts

## Constraints

- Follow `planning/memory/coding-standards.md` (one behavior per test).

## Done when

`tests:` and `acceptance:` items above are satisfied.
```

`T2-add-uppercase.md` — identical shape, no `depends_on`, exposes `upper(s)`.

`T3-add-titlecase.md` — adds `depends_on: [T2]`, references `upper` from T2 in `## Constraints`.

- [ ] **Step 4: Update `packages/skills/package.json`** to ship `skills/` as a folder

In `package.json`:

```json
{ "files": ["dist", "skills", "README.md"] }
```

- [ ] **Step 5: Commit**

```bash
git add packages/skills/skills/
git commit -m "feat(skills): decomposing-plan-into-tasks SKILL.md and example"
```

---
