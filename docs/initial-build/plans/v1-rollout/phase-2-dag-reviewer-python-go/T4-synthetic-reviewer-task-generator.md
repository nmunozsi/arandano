> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T4-synthetic-reviewer-task-generator.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md                           ← you are here
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 4: Synthetic reviewer task generator (TDD)

**Goal:** When a coder task completes (with `reviewer_required: true`), produce a synthetic reviewer task that depends on it, has `role: reviewer`, and references the same PR.

**Files:**

- Create: `packages/core/src/reviewer/synthesizeReviewerTask.ts`
- Create: `packages/core/src/reviewer/__tests__/synthesizeReviewerTask.test.ts`

- [x] **Step 1: Write the failing test** ✅

```ts
import { describe, expect, it } from 'vitest';
import { synthesizeReviewerTask } from '../synthesizeReviewerTask.js';
import type { TaskFrontmatter } from '../../types/task.js';

const coder: TaskFrontmatter = {
  id: 'T1',
  title: 'add greet',
  role: 'coder',
  quality: { reviewer_required: true } as never,
};

describe('synthesizeReviewerTask', () => {
  it('produces a T1-review task that depends on T1', () => {
    const r = synthesizeReviewerTask({ source: coder, prUrl: 'https://gh/x/y/pull/1' });
    expect(r.id).toBe('T1-review');
    expect(r.role).toBe('reviewer');
    expect(r.depends_on).toEqual(['T1']);
    expect(r.title).toContain('Review T1');
  });

  it('returns null when reviewer_required is false', () => {
    const cf: TaskFrontmatter = { ...coder, quality: { reviewer_required: false } as never };
    expect(synthesizeReviewerTask({ source: cf, prUrl: 'x' })).toBeNull();
  });
});
```

- [x] **Step 2: Implement** ✅ No `as never` casts needed — quality?.reviewer_required works directly.

```ts
import type { TaskFrontmatter } from '../types/task.js';

export function synthesizeReviewerTask(opts: {
  source: TaskFrontmatter;
  prUrl: string;
}): TaskFrontmatter | null {
  const reviewerRequired = (opts.source.quality as { reviewer_required?: boolean } | undefined)
    ?.reviewer_required;
  if (!reviewerRequired) return null;
  return {
    id: `${opts.source.id}-review`,
    title: `Review ${opts.source.id}: ${opts.source.title}`,
    role: 'reviewer',
    depends_on: [opts.source.id],
  };
}
```

- [x] **Step 3: Wire into the Orchestrator** ✅ Also writes synthetic MD to plan dir so runOne can find it.

In `orchestrator.ts`, after a coder task succeeds: call `synthesizeReviewerTask`, and if non-null, append to the in-memory `fms` list. The next iteration will pick it up.

```ts
// after: completed.push(id);
const sourceTask = fms.find((t) => t.id === id);
if (sourceTask && sourceTask.role === 'coder') {
  const prUrl = (await store.read()).tasks[id]?.pr_url ?? '';
  const reviewer = synthesizeReviewerTask({ source: sourceTask, prUrl });
  if (reviewer) fms.push(reviewer);
}
```

- [x] **Step 4: Add a test that the orchestrator spawns the reviewer task** ✅

In `orchestrator.test.ts`, add:

```ts
it('spawns a reviewer task when reviewer_required=true on the coder task', async () => {
  const planDir = join(dir, '.arandano', 'tasks', 'p');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
  await writeFile(join(dir, '.arandano', 'roles', 'reviewer.md'), '');
  await writeFile(
    join(planDir, 'T1-x.md'),
    '---\nid: T1\ntitle: x\nrole: coder\nquality: { reviewer_required: true }\n---\n',
  );
  await writeFile(
    join(dir, '.arandano', 'config.yaml'),
    /* same config but with reviewer role configured */
  );
  const exec = okExecutor();
  const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
  const r = await o.run();
  expect(r.completed.sort()).toEqual(['T1', 'T1-review']);
});
```

(Add `reviewer: { cli: claude-code, model: m }` to the config in this test.)

- [x] **Step 5: Run tests, commit** ✅ 5559e19 (15/15 pass)

```bash
npm test
git add packages/core/
git commit -m "feat(core): auto-spawn reviewer tasks after coder tasks"
```

---
