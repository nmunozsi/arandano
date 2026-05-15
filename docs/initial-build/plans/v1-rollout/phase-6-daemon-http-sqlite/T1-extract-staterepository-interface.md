> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T1-extract-staterepository-interface.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md                     ← you are here
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 1: Extract `StateRepository` interface (refactor with tests)

**Goal:** The existing `StateStore` becomes `FileStateStore` implementing a new `StateRepository` interface. The interface and a contract test suite ensure both file and SQLite implementations are interchangeable.

**Files:**

- Create: `packages/core/src/state/repository.ts`
- Rename: `packages/core/src/state/store.ts` → `fileStore.ts` (keep `StateStore` export for back-compat)
- Create: `packages/core/src/state/__tests__/repository.test.ts` (a contract test factory)

- [ ] **Step 1: Define `repository.ts`**

```ts
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

export interface StateRepository {
  read(): Promise<RunState>;
  update(taskId: string, patch: Partial<TaskState>): Promise<void>;
}
```

- [ ] **Step 2: Move existing `StateStore` into `fileStore.ts`**

Rename and re-export:

```ts
// packages/core/src/state/fileStore.ts
import {} from /* existing impl */ '...';
export class FileStateStore implements StateRepository {
  /* moved from store.ts */
}
export { FileStateStore as StateStore }; // back-compat
```

In `packages/core/src/index.ts`:

```ts
export { FileStateStore, StateStore } from './state/fileStore.js';
export type { RunState, TaskState, TaskStatus, StateRepository } from './state/repository.js';
```

- [ ] **Step 3: Author the contract test factory**

```ts
// packages/core/src/state/__tests__/repository.test.ts
import { describe, expect, it } from 'vitest';
import type { StateRepository } from '../repository.js';

export function describeStateRepository(
  name: string,
  factory: () => Promise<{ store: StateRepository; cleanup: () => Promise<void> }>,
) {
  describe(name, () => {
    it('reads empty state initially', async () => {
      const { store, cleanup } = await factory();
      try {
        const s = await store.read();
        expect(s.tasks).toEqual({});
      } finally {
        await cleanup();
      }
    });
    it('updates and re-reads', async () => {
      const { store, cleanup } = await factory();
      try {
        await store.update('T1', { status: 'in_progress' });
        const s = await store.read();
        expect(s.tasks.T1?.status).toBe('in_progress');
      } finally {
        await cleanup();
      }
    });
    it('preserves unrelated tasks', async () => {
      const { store, cleanup } = await factory();
      try {
        await store.update('T1', { status: 'completed' });
        await store.update('T2', { status: 'failed' });
        const s = await store.read();
        expect(s.tasks.T1?.status).toBe('completed');
        expect(s.tasks.T2?.status).toBe('failed');
      } finally {
        await cleanup();
      }
    });
  });
}

import { FileStateStore } from '../fileStore.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describeStateRepository('FileStateStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arandano-fss-'));
  return {
    store: new FileStateStore(join(dir, 'state.json')),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
});
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test -- repository
git add packages/core/
git commit -m "refactor(core): StateRepository interface; FileStateStore implements it"
```

---
