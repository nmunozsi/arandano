> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T2-plan-loader.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md                                                 ← you are here
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 2: Plan loader (TDD)

**Goal:** Walk a plan directory (`.arandano/tasks/<plan-slug>/T*.md`), parse each, return the list.

**Files:**

- Create: `packages/core/src/tasks/loadPlan.ts`
- Create: `packages/core/src/tasks/__tests__/loadPlan.test.ts`

- [x] **Step 1: Write the failing test** ✅

`packages/core/src/tasks/__tests__/loadPlan.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan } from '../loadPlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plan-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('loadPlan', () => {
  it('loads all task MDs in a plan dir', async () => {
    const planDir = join(dir, '.arandano', 'tasks', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(
      join(planDir, 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\ndepends_on: [T1]\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
    expect(tasks.find((t) => t.frontmatter.id === 'T2')?.frontmatter.depends_on).toEqual(['T1']);
  });
});
```

- [x] **Step 2: Implement `packages/core/src/tasks/loadPlan.ts`** ✅

```ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTaskMd } from '../parsers/task-md.js';
import type { TaskMd } from '../types/task.js';

export async function loadPlan(opts: { projectRoot: string; planSlug: string }): Promise<TaskMd[]> {
  const dir = join(opts.projectRoot, '.arandano', 'tasks', opts.planSlug);
  const entries = await readdir(dir);
  const out: TaskMd[] = [];
  for (const name of entries) {
    if (!/^T\d+-.*\.md$/.test(name)) continue;
    const fp = join(dir, name);
    out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
  }
  return out;
}
```

- [x] **Step 3: Run tests, commit** ✅ 495cdad (2/2 pass)

```bash
npm test -- loadPlan
git add packages/core/src/tasks/
git commit -m "feat(core): plan task loader"
```

---
