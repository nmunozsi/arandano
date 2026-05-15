> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/phase.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md                                               ← you are here
> ├── T1-author-the-skill-markdown.md
> ├── T2-validate-task-tree-helper.md
> ├── T3-arandano-plan-decompose-plan-md-command.md
> ├── T4-inject-the-skill-into-the-worker-image.md
> └── T5-end-to-end-smoke.md
> ```

# arandano Phase 7 — Auto-Planner Skill Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — the `@arandano/skills` package **already exists** (with a `BUNDLED_SKILLS` registry); Task 1 extends it rather than creating it. Phase 7 also depends on Phase 2's `loadPlan` and `parseTaskMd` (which exists from Phase 1).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a skill named `arandano:decomposing-plan-into-tasks` that takes a plan MD as input and produces a tree of well-formed task MDs under `.arandano/tasks/<plan-slug>/T<n>-<slug>.md`. Plus the CLI subcommand `arandano plan decompose <plan-md>` that invokes the skill via the configured planner role's CLI/model. Optional phase — many users decompose plans by hand, but this closes the last "manual step" in the lifecycle.

**Architecture:** A skill is just a markdown file with frontmatter that any superpowers-aware CLI loads on demand. We ship it as part of `@arandano/skills` so it's installed alongside the worker. The `arandano plan decompose` command:

1. Reads the plan MD.
2. Spawns a worker container with `role: planner` and a synthetic task instructing the agent to use the new skill.
3. The agent reads the plan, applies the skill's procedure, writes the task MDs, and exits.
4. The orchestrator validates the produced files (DAG + frontmatter shape) before returning.

This avoids reinventing prompt orchestration in the CLI — we reuse the worker for the same execution discipline (TDD, gates, …) we already have.

**Tech Stack:** Adds the skill file itself (markdown with frontmatter); no new dependencies.

**Reference spec:** `arandano-design.md` §5 (Skills component), §7 (Layer 1/2/3), §11 (skills mapping), §24 Phase 7.

**Scope deferrals:**

- LLM-driven plan generation from a 1-paragraph idea (i.e., spec→plan→tasks). v1 is plan→tasks only.

---

## Phase 1 reality check (2026-05-11)

The `@arandano/skills` package exists from Phase 0/1. This phase **extends** it.

**Locked-in Phase 1 surfaces:**

- `@arandano/skills` package exists — `packages/skills/`:
  - `src/index.ts`: `export { BUNDLED_SKILLS } from './registry.js'; export type { SkillMeta } from './registry.js';`
  - `src/registry.ts`:
    ```ts
    export interface SkillMeta {
      name: string;
      description: string;
    }
    // Phase 1 fills this in with real skill definitions; Phase 0 just ships the registry shape.
    export const BUNDLED_SKILLS: SkillMeta[] = [];
    ```
  - Phase 1 did NOT actually fill `BUNDLED_SKILLS` despite the comment — it's still `[]`. Phase 7 is the natural home for the first entry.
- `parseTaskMd` — already exported from `@arandano/core`:
  ```ts
  export { parseTaskMd } from './parsers/task-md.js';
  ```
  Task 2's `validateTaskTree` consumes this; don't reinvent parsing.
- Task MD frontmatter schema — `packages/core/src/types/task.ts` (and the Zod schema in `parsers/task-md.ts`). Required fields per Phase 1: `id`, `title`, `role`. Optional: `cli`, `model`, `tdd`, `quality`, `mcp`, `timeout_minutes`, `depends_on`. **Verify** the actual schema before drafting frontmatter examples in `SKILL.md` — the plan's example uses `tests:`, `acceptance:`, and `quality.reviewer_required` which may or may not be in the schema today.
- Task MD location convention: `.arandano/tasks/<plan-slug>/T<n>-<slug>.md` — Phase 1's `findTaskMd` (in `runOne.ts`) globs for `${id}-*.md` here.
- Worker image — `arandano-worker/Dockerfile` already clones superpowers via `git clone --depth=1 https://github.com/obra/superpowers.git /home/worker/.claude/plugins/superpowers`. Task 4 adds a parallel COPY for `@arandano/skills`.
- CLI exit-code idiom: `process.exit(code)` (not `this.exit(code)`).
- `runOne` — single-task dispatcher already exists; the `plan decompose` command in Task 3 calls `runOne` once with a synthetic planner task.

**Per-task corrections:**

- **Task 1, Step 1** (`SKILL.md`): file path is `packages/skills/skills/decomposing-plan-into-tasks/SKILL.md`. Add the skill metadata as the **first entry** in the existing `BUNDLED_SKILLS` array at `packages/skills/src/registry.ts`:
  ```ts
  export const BUNDLED_SKILLS: SkillMeta[] = [
    {
      name: 'arandano:decomposing-plan-into-tasks',
      description:
        'Use when given a written plan MD that needs to be turned into one task MD per implementable unit.',
    },
  ];
  ```
  Don't replace the existing `[]` with a single-item array via re-export from elsewhere — keep the list literal in `registry.ts` so future skills append cleanly.
- **Task 1, Step 1** (frontmatter example in SKILL.md): cross-check `packages/core/src/parsers/task-md.ts` Zod schema. If `tests:`, `acceptance:`, or `quality.reviewer_required` aren't in the schema, either (a) extend the schema as part of this phase, or (b) use only fields the schema accepts (`id`, `title`, `role`, `tdd`, `depends_on`, `quality`).
- **Task 2** (`validateTaskTree`): location is `packages/core/src/tasks/validateTaskTree.ts`. Import `parseTaskMd` from the same module — `from '../parsers/task-md.js'`. Must validate: every task parses, no duplicate `id`s, `depends_on` refs all exist, no cycles (reuse `validateDag` from Phase 2 Task 1 if available — otherwise inline a Kahn check).
- **Task 3** (`plan decompose` command): oclif topic command. Path: `packages/cli/src/commands/plan/decompose.ts` (oclif auto-discovers subcommand structure). The command synthesizes a one-shot `TaskRun` for a planner role and calls `runOne({ projectRoot, taskId: synthetic, executor })`. The synthetic task MD must be writable to a temp location under `.arandano/tasks/_decompose-<timestamp>/` so `runOne`'s `findTaskMd` glob picks it up. Use `process.exit(code)` for non-zero exits.
- **Task 4** (inject skill into worker image): the Dockerfile lives in the **worker repo**, not the main monorepo — `arandano-worker/Dockerfile`. Add a stage that npm-installs `@arandano/skills` (or COPYs the package into the image) and a step that symlinks `node_modules/@arandano/skills/skills/decomposing-plan-into-tasks` into `/home/worker/.claude/plugins/arandano-skills/`. The worker's superpowers loader will discover it the same way it discovers the bundled superpowers plugin.
- **Sequencing**: Task 5 (e2e) depends on Phase 2's `loadPlan` and `validateDag`. Sequence Phase 7 after Phase 2 Task 2 ships.

---

## File Structure

```
arandano/
├── packages/skills/
│   ├── src/
│   │   ├── registry.ts                                  modify: include the new skill
│   │   └── __tests__/decompose.test.ts                  validation tests for produced task MDs
│   └── skills/
│       └── decomposing-plan-into-tasks/                 the skill itself
│           ├── SKILL.md                                 metadata + procedure
│           └── examples/
│               ├── input-plan.md
│               └── expected-tasks/T{1,2,3}-*.md
├── packages/cli/src/commands/
│   ├── plan/
│   │   ├── decompose.ts                                 new
│   │   └── __tests__/decompose.test.ts
│   └── plan.ts                                          (oclif: `arandano plan ...` topic)
└── packages/core/src/tasks/
    ├── validateTaskTree.ts                              new: schema + DAG validation over a folder
    └── __tests__/validateTaskTree.test.ts
```

---

## Tasks

- [ ] [T1 — Author the skill markdown](T1-author-the-skill-markdown.md)
- [ ] [T2 — Validate-task-tree helper (TDD)](T2-validate-task-tree-helper.md)
- [ ] [T3 — `arandano plan decompose <plan-md>` command (TDD)](T3-arandano-plan-decompose-plan-md-command.md)
- [ ] [T4 — Inject the skill into the worker image](T4-inject-the-skill-into-the-worker-image.md)
- [ ] [T5 — End-to-end smoke](T5-end-to-end-smoke.md)

---

## Exit criteria

## Phase 7 done — exit criteria

- [ ] `arandano:decomposing-plan-into-tasks` skill is present in the worker image and discoverable
- [ ] `validateTaskTree` catches frontmatter errors, duplicates, missing deps, and cycles
- [ ] `arandano plan decompose <plan-md>` produces a valid task tree from a real plan
- [ ] One end-to-end "plan → tasks → PRs" run is documented in `arandano-examples`

After this, the next plan covers **Phase 8 — MCP catalog and examples polish**.
