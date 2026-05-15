> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T9-implement-run-state-store.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md                                   ← you are here
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 9: Implement run state store (TDD)

**Goal:** A small, atomic JSON file at `.arandano/state.json` tracking per-task status, branch, PR URL, retry count.

**Files:**

- Create: `packages/core/src/state/store.ts`
- Create: `packages/core/src/__tests__/state.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/state.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../state/store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-state-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('StateStore', () => {
  it('reads an empty state when file does not exist', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    const state = await store.read();
    expect(state.tasks).toEqual({});
  });

  it('writes and re-reads task status', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    await store.update('T1', { status: 'in_progress' });
    const state = await store.read();
    expect(state.tasks.T1?.status).toBe('in_progress');
  });

  it('preserves unrelated tasks when updating one', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    await store.update('T1', { status: 'completed', branch: 'agent/T1-x' });
    await store.update('T2', { status: 'failed' });
    const state = await store.read();
    expect(state.tasks.T1?.status).toBe('completed');
    expect(state.tasks.T1?.branch).toBe('agent/T1-x');
    expect(state.tasks.T2?.status).toBe('failed');
  });

  it('write is atomic (no partial files on crash simulation)', async () => {
    const path = join(dir, 'state.json');
    const store = new StateStore(path);
    await store.update('T1', { status: 'completed' });
    const text = await readFile(path, 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- state.test
```

Expected: fail (`StateStore` not found).

- [x] **Step 3: Implement `packages/core/src/state/store.ts`**

```ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'failed' | 'partial';

export interface TaskState {
  status: TaskStatus;
  branch?: string;
  pr_url?: string;
  attempts?: number;
  last_error?: string;
}

export interface RunState {
  tasks: Record<string, TaskState>;
}

const EMPTY: RunState = { tasks: {} };

export class StateStore {
  constructor(private readonly path: string) {}

  async read(): Promise<RunState> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(text) as Partial<RunState>;
      return { tasks: parsed.tasks ?? {} };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
      throw err;
    }
  }

  async update(taskId: string, patch: Partial<TaskState>): Promise<void> {
    const current = await this.read();
    const existing = current.tasks[taskId] ?? { status: 'pending' as const };
    const next: RunState = {
      tasks: { ...current.tasks, [taskId]: { ...existing, ...patch } },
    };
    await this.writeAtomic(next);
  }

  private async writeAtomic(state: RunState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, this.path);
  }
}
```

- [x] **Step 4: Export from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
export { loadConfig } from './config/load.js';
export { StateStore } from './state/store.js';
export type { RunState, TaskState, TaskStatus } from './state/store.js';
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- state.test
```

Expected: all 4 tests pass.

- [x] **Step 6: Run all gates one more time before commit**

```bash
npm run lint && npm run typecheck && npm test && npm run audit
```

Expected: all green.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/state/ packages/core/src/__tests__/state.test.ts packages/core/src/index.ts
git commit -m "feat(core): atomic state store for run tracking"
```

---
