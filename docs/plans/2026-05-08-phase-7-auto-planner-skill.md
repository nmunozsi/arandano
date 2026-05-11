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

### Task 2: Validate-task-tree helper (TDD)

**Goal:** A single function that reads a `.arandano/tasks/<slug>/` folder and reports any frontmatter or DAG problem. Used by the `arandano plan decompose` command after the agent runs.

**Files:**

- Create: `packages/core/src/tasks/validateTaskTree.ts`
- Create: `packages/core/src/tasks/__tests__/validateTaskTree.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateTaskTree } from '../validateTaskTree.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-vtt-'));
  return async () => rm(dir, { recursive: true, force: true });
});

async function seed(files: Array<{ name: string; body: string }>) {
  const planDir = join(dir, '.arandano', 'tasks', 'p');
  await mkdir(planDir, { recursive: true });
  for (const f of files) await writeFile(join(planDir, f.name), f.body);
}

describe('validateTaskTree', () => {
  it('passes a clean tree of two tasks', async () => {
    await seed([
      { name: 'T1-x.md', body: '---\nid: T1\ntitle: x\nrole: coder\n---\n' },
      { name: 'T2-y.md', body: '---\nid: T2\ntitle: y\nrole: coder\ndepends_on: [T1]\n---\n' },
    ]);
    const r = await validateTaskTree({ projectRoot: dir, planSlug: 'p' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('reports invalid frontmatter', async () => {
    await seed([{ name: 'T1-x.md', body: '---\ntitle: x\n---\n' }]); // missing id, role
    const r = await validateTaskTree({ projectRoot: dir, planSlug: 'p' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/id|role/);
  });

  it('reports a cycle', async () => {
    await seed([
      { name: 'T1-x.md', body: '---\nid: T1\ntitle: x\nrole: coder\ndepends_on: [T2]\n---\n' },
      { name: 'T2-y.md', body: '---\nid: T2\ntitle: y\nrole: coder\ndepends_on: [T1]\n---\n' },
    ]);
    const r = await validateTaskTree({ projectRoot: dir, planSlug: 'p' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/cycle/);
  });

  it('reports a dependency on a non-existent task', async () => {
    await seed([
      { name: 'T1-x.md', body: '---\nid: T1\ntitle: x\nrole: coder\ndepends_on: [T_GHOST]\n---\n' },
    ]);
    const r = await validateTaskTree({ projectRoot: dir, planSlug: 'p' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/T_GHOST/);
  });

  it('reports duplicate task ids', async () => {
    await seed([
      { name: 'T1-a.md', body: '---\nid: T1\ntitle: a\nrole: coder\n---\n' },
      { name: 'T1-b.md', body: '---\nid: T1\ntitle: b\nrole: coder\n---\n' },
    ]);
    const r = await validateTaskTree({ projectRoot: dir, planSlug: 'p' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/);
  });
});
```

- [ ] **Step 2: Implement `validateTaskTree.ts`**

```ts
import { loadPlan } from './loadPlan.js';
import { validateDag } from '../orchestrator/dag.js';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

export async function validateTaskTree(opts: {
  projectRoot: string;
  planSlug: string;
}): Promise<ValidateResult> {
  const errors: string[] = [];
  let tasks: Awaited<ReturnType<typeof loadPlan>>;
  try {
    tasks = await loadPlan(opts);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }

  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.frontmatter.id)) errors.push(`duplicate task id: ${t.frontmatter.id}`);
    seen.add(t.frontmatter.id);
  }

  try {
    validateDag(tasks.map((t) => t.frontmatter));
  } catch (e) {
    errors.push((e as Error).message);
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 3: Export and run tests**

```ts
// packages/core/src/index.ts
export { validateTaskTree } from './tasks/validateTaskTree.js';
```

```bash
npm test -- validateTaskTree
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/
git commit -m "feat(core): validateTaskTree checks frontmatter, duplicates, DAG"
```

---

### Task 3: `arandano plan decompose <plan-md>` command (TDD)

**Goal:** Read the plan MD, generate a synthetic planner task that asks the agent to apply the skill, dispatch via the executor (Docker or k8s, matching `executor.backend`), then validate the produced tree.

**Files:**

- Create: `packages/cli/src/commands/plan/decompose.ts`
- Create: `packages/cli/src/commands/plan/__tests__/decompose.test.ts`

- [ ] **Step 1: Write the failing test (mocked executor)**

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Decompose from '../decompose.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plandec-'));
  return async () => rm(dir, { recursive: true, force: true });
});

vi.mock('@arandano/executors-docker', async () => ({
  DockerExecutor: class {
    async start() {
      return { id: 'h' };
    }
    async wait() {
      return { exitCode: 0, reason: 'ok' };
    }
    async *logs() {}
    async cancel() {}
  },
}));

describe('arandano plan decompose', () => {
  it('reports validation success when the agent produced valid tasks', async () => {
    await mkdir(join(dir, 'planning', 'plans'), { recursive: true });
    await writeFile(join(dir, 'planning', 'plans', '2026-05-08-x-plan.md'), '# x');
    // Pre-seed valid task tree (simulating the agent's output)
    await mkdir(join(dir, '.arandano', 'tasks', '2026-05-08-x'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'tasks', '2026-05-08-x', 'T1-x.md'),
      '---\nid: T1\ntitle: x\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'config.yaml'),
      `project: { name: x, default_branch: main }
executor: { backend: docker, docker: { image: i, workdir: /workspace, plugins_mount: baked-in, env_pass: [] } }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: false }
roles: { planner: { cli: claude-code, model: m }, coder: { cli: claude-code, model: m, tdd: strict } }
quality_defaults: { format: required, lint: required, typecheck: required, test: required, coverage: { min: 80, delta: any }, security: required, commit_msg: conventional, reviewer_required: false }
batching: { max_parallel: 1, timeout_minutes: 5, retry_policy: { max_attempts: 1, on: [container_error] } }
`,
    );

    const orig = process.cwd();
    process.chdir(dir);
    try {
      await Decompose.run(['planning/plans/2026-05-08-x-plan.md']);
    } finally {
      process.chdir(orig);
    }
  });
});
```

- [ ] **Step 2: Implement `decompose.ts`**

```ts
import { Args, Command } from '@oclif/core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import yaml from 'yaml';
import { validateTaskTree } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';

export default class Decompose extends Command {
  static override description = 'Use the planner agent to turn a plan MD into a tree of task MDs.';
  static override args = { planPath: Args.string({ required: true }) };

  async run(): Promise<void> {
    const { args } = await this.parse(Decompose);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'));

    const planText = await readFile(join(projectRoot, args.planPath), 'utf8');
    const slug = basename(args.planPath)
      .replace(/-plan\.md$/, '')
      .replace(/\.md$/, '');

    // Synthesize a planner task that asks the agent to apply the skill.
    const synthDir = join(projectRoot, '.arandano', 'tasks', `__decompose-${slug}`);
    await mkdir(synthDir, { recursive: true });
    const synthPath = join(synthDir, 'T1-decompose.md');
    await writeFile(
      synthPath,
      [
        '---',
        'id: T1',
        `title: Decompose plan ${slug} into task MDs`,
        'role: planner',
        'tdd: relaxed',
        'tests: []',
        'acceptance:',
        `  - "Wrote one or more T<n>-<slug>.md files under .arandano/tasks/${slug}/"`,
        '---',
        '',
        '## Context',
        '',
        `Apply the \`arandano:decomposing-plan-into-tasks\` skill to the plan at \`${args.planPath}\`. Write the resulting task MDs to \`.arandano/tasks/${slug}/\`.`,
        '',
        '## Plan content',
        '',
        planText,
      ].join('\n'),
      'utf8',
    );

    const executor = new DockerExecutor({
      image: cfg.executor.docker.image,
      host: cfg.executor.docker.host,
      projectRoot,
    });
    // Reuse runOne with our synthetic task.
    const { runOne } = await import('@arandano/core');
    const r = await runOne({ projectRoot, taskId: 'T1', executor });
    if (r.exitCode !== 0) throw new Error(`planner failed: ${r.reason}`);

    const v = await validateTaskTree({ projectRoot, planSlug: slug });
    if (!v.ok) {
      this.warn('Decomposition validation found problems:');
      for (const e of v.errors) this.warn(`  - ${e}`);
      this.exit(1);
    }
    this.log(`Decomposed plan into validated tasks under .arandano/tasks/${slug}/`);
  }
}
```

(Note: `runOne` is currently keyed on the task id, which would collide if `T1` is also used elsewhere. The synthetic dir keeps it in its own plan slug; verify `findTaskMd` glob is constrained accordingly. If not, extend `runOne` to accept an explicit plan slug — small refactor, do it now if needed.)

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- decompose
git add packages/cli/
git commit -m "feat(cli): arandano plan decompose <plan-md>"
```

---

### Task 4: Inject the skill into the worker image

**Goal:** The worker image needs to know where to find the skill. Two options:

- **A:** Bake the `@arandano/skills` package into the worker image at build time (clone-and-symlink under `/home/worker/.claude/plugins/arandano-skills/`).
- **B:** Mount it in at runtime from the project's `node_modules/@arandano/skills/skills/`.

Pick A for portability — every worker has the skills regardless of project state.

**Files:**

- Modify: `arandano-worker/Dockerfile`
- Modify: `arandano-worker/.github/workflows/release.yml` to invalidate cache when skill content changes (already cache-busts on full repo)

- [ ] **Step 1: Update the Dockerfile**

```dockerfile
# After the superpowers clone:
RUN git clone --depth=1 https://github.com/nmunozsi/arandano.git /tmp/arandano \
 && mkdir -p /home/worker/.claude/plugins/arandano-skills/skills \
 && cp -r /tmp/arandano/packages/skills/skills/* /home/worker/.claude/plugins/arandano-skills/skills/ \
 && rm -rf /tmp/arandano
```

(Or COPY a tarball produced by the CI of the `arandano` repo. Pinning a specific commit avoids drift; for v1 we accept "latest main" with the understanding that `arandano-worker` is rebuilt on every `arandano` release.)

- [ ] **Step 2: Add a smoke test inside the worker image**

In `arandano-worker/lib/src/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

describe('worker image bundles arandano skills', () => {
  it('has decomposing-plan-into-tasks/SKILL.md', () => {
    // Skip when not running inside the image.
    const p =
      '/home/worker/.claude/plugins/arandano-skills/skills/decomposing-plan-into-tasks/SKILL.md';
    if (!existsSync('/home/worker/.claude/plugins/arandano-skills')) return;
    expect(existsSync(p)).toBe(true);
  });
});
```

- [ ] **Step 3: Build, push, commit**

```bash
docker build -t arandano-worker:dev .
git add Dockerfile lib/
git commit -m "feat: bake arandano skills into worker image"
```

---

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

## Phase 7 done — exit criteria

- [ ] `arandano:decomposing-plan-into-tasks` skill is present in the worker image and discoverable
- [ ] `validateTaskTree` catches frontmatter errors, duplicates, missing deps, and cycles
- [ ] `arandano plan decompose <plan-md>` produces a valid task tree from a real plan
- [ ] One end-to-end "plan → tasks → PRs" run is documented in `arandano-examples`

After this, the next plan covers **Phase 8 — MCP catalog and examples polish**.
