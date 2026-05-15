> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/T2-validate-task-tree-helper.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md
> ├── T1-author-the-skill-markdown.md
> ├── T2-validate-task-tree-helper.md                        ← you are here
> ├── T3-arandano-plan-decompose-plan-md-command.md
> ├── T4-inject-the-skill-into-the-worker-image.md
> └── T5-end-to-end-smoke.md
> ```

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
