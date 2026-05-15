> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T1-dag-construction-and-ready-batch-selection.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md                  ← you are here
> ├── T2-plan-loader.md
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

### Task 1: DAG construction and ready-batch selection (TDD)

**Goal:** Pure functions over a list of `TaskFrontmatter`s + a `RunState`. Returns the next batch of ready task IDs (those whose `depends_on` are all `completed`), capped at `max_parallel`. Detects cycles and missing dependencies.

**Files:**

- Create: `packages/core/src/orchestrator/dag.ts`
- Create: `packages/core/src/orchestrator/__tests__/dag.test.ts`

- [x] **Step 1: Write the failing tests** ✅

`packages/core/src/orchestrator/__tests__/dag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectReadyBatch, validateDag } from '../dag.js';
import type { TaskFrontmatter } from '../../types/task.js';

const tf = (id: string, deps: string[] = []): TaskFrontmatter => ({
  id,
  title: id,
  role: 'coder',
  depends_on: deps,
});

describe('validateDag', () => {
  it('passes a clean DAG', () => {
    expect(() => validateDag([tf('T1'), tf('T2', ['T1']), tf('T3', ['T1'])])).not.toThrow();
  });
  it('throws on cycle', () => {
    expect(() => validateDag([tf('T1', ['T2']), tf('T2', ['T1'])])).toThrow(/cycle/);
  });
  it('throws on missing dependency', () => {
    expect(() => validateDag([tf('T2', ['T_GHOST'])])).toThrow(/T_GHOST/);
  });
});

describe('selectReadyBatch', () => {
  it('selects all root tasks initially', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3', ['T1'])],
      state: { tasks: {} },
      maxParallel: 5,
    });
    expect(batch.sort()).toEqual(['T1', 'T2']);
  });

  it('caps at maxParallel', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3'), tf('T4')],
      state: { tasks: {} },
      maxParallel: 2,
    });
    expect(batch.length).toBe(2);
  });

  it('does not include tasks already in_progress or completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2')],
      state: { tasks: { T1: { status: 'in_progress' }, T2: { status: 'completed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });

  it('unblocks a task once its deps are completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'completed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual(['T2']);
  });

  it('stops a task whose dependency failed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'failed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail** ✅

```bash
npm test -- dag
```

- [x] **Step 3: Implement `packages/core/src/orchestrator/dag.ts`**

```ts
import type { TaskFrontmatter } from '../types/task.js';
import type { RunState } from '../state/store.js';

export function validateDag(tasks: TaskFrontmatter[]): void {
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    for (const d of t.depends_on ?? []) {
      if (!ids.has(d)) throw new Error(`task ${t.id} depends on unknown task ${d}`);
    }
  }
  // Kahn's algorithm: count incoming edges, peel off zero-indegree.
  const indeg = new Map<string, number>();
  for (const t of tasks) indeg.set(t.id, (t.depends_on ?? []).length);
  const queue: string[] = [];
  for (const [id, n] of indeg) if (n === 0) queue.push(id);
  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    processed += 1;
    for (const t of tasks) {
      if ((t.depends_on ?? []).includes(id)) {
        const next = (indeg.get(t.id) ?? 0) - 1;
        indeg.set(t.id, next);
        if (next === 0) queue.push(t.id);
      }
    }
  }
  if (processed !== tasks.length) throw new Error('cycle detected in task DAG');
}

export interface SelectOpts {
  tasks: TaskFrontmatter[];
  state: RunState;
  maxParallel: number;
}

export function selectReadyBatch(opts: SelectOpts): string[] {
  const status = (id: string) => opts.state.tasks[id]?.status;
  const ready: string[] = [];
  for (const t of opts.tasks) {
    if (status(t.id) === 'completed' || status(t.id) === 'in_progress' || status(t.id) === 'failed')
      continue;
    const deps = t.depends_on ?? [];
    if (deps.every((d) => status(d) === 'completed')) ready.push(t.id);
  }
  return ready.slice(0, opts.maxParallel);
}
```

- [x] **Step 4: Run tests to verify they pass** ✅ (8/8 pass)

```bash
npm test -- dag
```

- [x] **Step 5: Commit** ✅ f512e62 — note: status 'in_progress' corrected to 'running' to match Phase 1 TaskStatus; retry_count: 0 added to seeded states

```bash
git add packages/core/src/orchestrator/
git commit -m "feat(core): DAG validation and ready-batch selection"
```

---
