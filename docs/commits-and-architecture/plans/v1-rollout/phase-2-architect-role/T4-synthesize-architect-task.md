> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T4-synthesize-architect-task.md`

---

id: T4
title: synthesizeArchitectTask helper + unit tests
role: coder
tdd: strict
depends_on: [T1, T3]

---

# T4 — synthesizeArchitectTask

**Files:**

- Create: `packages/core/src/architect/synthesizeArchitectTask.ts`
- Create: `packages/core/src/architect/__tests__/synthesizeArchitectTask.test.ts`
- Modify: `packages/core/src/index.ts` (export the helper)

**Why:** The Orchestrator (T5) needs a pure function that, given the resolved plan's task list + flags, decides whether to append a `T-architect` task and what its frontmatter looks like. Mirrors `synthesizeReviewerTask`.

---

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/architect/__tests__/synthesizeArchitectTask.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { synthesizeArchitectTask } from '../synthesizeArchitectTask.js';
import type { TaskFrontmatter } from '../../types/task.js';

const t1: TaskFrontmatter = { id: 'T1', title: 'A', role: 'coder' };
const t2: TaskFrontmatter = { id: 'T2', title: 'B', role: 'coder' };

describe('synthesizeArchitectTask', () => {
  it('returns null when config.enabled=false and no override', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: false,
      withArchitect: false,
      noArchitect: false,
      runShape: 'plan',
    });
    expect(r).toBeNull();
  });

  it('returns null on single-task runs', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'single',
    });
    expect(r).toBeNull();
  });

  it('returns null on phase runs without --with-architect', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'phase',
    });
    expect(r).toBeNull();
  });

  it('returns a task on phase runs WITH --with-architect', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: false,
      withArchitect: true,
      noArchitect: false,
      runShape: 'phase',
    });
    expect(r?.id).toBe('T-architect');
  });

  it('returns null when --no-architect overrides config', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: true,
      runShape: 'plan',
    });
    expect(r).toBeNull();
  });

  it('throws when both --with-architect and --no-architect are set', () => {
    expect(() =>
      synthesizeArchitectTask({
        tasks: [t1, t2],
        planSlug: 'p',
        enabledInConfig: true,
        withArchitect: true,
        noArchitect: true,
        runShape: 'plan',
      }),
    ).toThrow(/mutually exclusive/);
  });

  it('depends on every other task in the plan', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'plan',
    });
    expect(r?.depends_on).toEqual(['T1', 'T2']);
    expect(r?.role).toBe('architect');
    expect(r?.title).toContain('architecture.md');
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

```bash
npm test --workspace=@arandano/core -- -t synthesizeArchitectTask
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/core/src/architect/synthesizeArchitectTask.ts`:

```ts
import type { TaskFrontmatter } from '../types/task.js';

export type RunShape = 'plan' | 'phase' | 'single';

export interface SynthesizeArchitectOpts {
  tasks: TaskFrontmatter[];
  planSlug: string;
  enabledInConfig: boolean;
  withArchitect: boolean;
  noArchitect: boolean;
  runShape: RunShape;
}

export function synthesizeArchitectTask(opts: SynthesizeArchitectOpts): TaskFrontmatter | null {
  if (opts.withArchitect && opts.noArchitect) {
    throw new Error('--with-architect and --no-architect are mutually exclusive');
  }
  if (opts.noArchitect) return null;
  if (opts.runShape === 'single') return null;
  if (opts.runShape === 'phase' && !opts.withArchitect) return null;
  if (opts.runShape === 'plan' && !opts.withArchitect && !opts.enabledInConfig) return null;

  return {
    id: 'T-architect',
    title: `Refresh docs/architecture.md after plan ${opts.planSlug}`,
    role: 'architect',
    depends_on: opts.tasks.map((t) => t.id),
  };
}
```

- [ ] **Step 4: Export from the package**

Edit `packages/core/src/index.ts` and append:

```ts
export {
  synthesizeArchitectTask,
  type RunShape,
  type SynthesizeArchitectOpts,
} from './architect/synthesizeArchitectTask.js';
```

- [ ] **Step 5: Re-run tests**

```bash
npm test --workspace=@arandano/core -- -t synthesizeArchitectTask
```

Expected: PASS for all 7 cases.

- [ ] **Step 6: Run the full core test suite**

```bash
npm test --workspace=@arandano/core
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/architect packages/core/src/index.ts
git commit -m ":white_check_mark: test(core): cover synthesizeArchitectTask"
git add packages/core/src/architect/synthesizeArchitectTask.ts
# (no second commit needed — both files staged together above)
```

Actually use a single commit for both file + tests:

```bash
git reset HEAD~1
git add packages/core/src/architect packages/core/src/index.ts
git commit -m ":sparkles: feat(core): synthesizeArchitectTask helper"
```

## Acceptance

- `synthesizeArchitectTask` exported from `@arandano/core`
- All 7 unit tests pass
- The full `@arandano/core` test suite still passes
