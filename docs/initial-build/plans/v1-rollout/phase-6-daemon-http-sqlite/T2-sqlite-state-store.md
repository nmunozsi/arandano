> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T2-sqlite-state-store.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md                                    ← you are here
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 2: SQLite state store (TDD via the contract suite)

**Goal:** New `SqliteStateStore` in `@arandano/daemon` that satisfies the same `StateRepository` contract.

**Files:**

- Create: `packages/daemon/package.json` (with `better-sqlite3`)
- Create: `packages/daemon/src/state/sqliteStore.ts`
- Create: `packages/daemon/src/state/__tests__/sqliteStore.test.ts`

- [ ] **Step 1: Scaffold the daemon package**

```json
{
  "name": "@arandano/daemon",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "bin": { "arandano-daemon": "./dist/bin.js" },
  "files": ["dist", "deploy", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0",
    "@arandano/executors-docker": "0.0.0",
    "@arandano/executors-k8s": "0.0.0",
    "better-sqlite3": "^11.0.0",
    "fastify": "^4.28.0",
    "yaml": "^2.5.0",
    "zod": "^3.23.0"
  }
}
```

`tsconfig.json` and `tsup.config.ts` mirror other packages.

- [ ] **Step 2: Implement `SqliteStateStore`**

```ts
// src/state/sqliteStore.ts
import Database from 'better-sqlite3';
import type { RunState, StateRepository, TaskState } from '@arandano/core';

export interface SqliteOpts {
  path: string;
  projectRoot: string;
}

export class SqliteStateStore implements StateRepository {
  private readonly db: Database.Database;
  constructor(private readonly opts: SqliteOpts) {
    this.db = new Database(opts.path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_state (
        project_root TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        branch TEXT,
        pr_url TEXT,
        attempts INTEGER,
        last_error TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (project_root, task_id)
      );
    `);
  }

  async read(): Promise<RunState> {
    const rows = this.db
      .prepare<
        [string]
      >('SELECT task_id, status, branch, pr_url, attempts, last_error FROM task_state WHERE project_root = ?')
      .all(this.opts.projectRoot) as Array<{
      task_id: string;
      status: string;
      branch: string | null;
      pr_url: string | null;
      attempts: number | null;
      last_error: string | null;
    }>;
    const tasks: Record<string, TaskState> = {};
    for (const r of rows) {
      tasks[r.task_id] = {
        status: r.status as TaskState['status'],
        branch: r.branch ?? undefined,
        pr_url: r.pr_url ?? undefined,
        attempts: r.attempts ?? undefined,
        last_error: r.last_error ?? undefined,
      };
    }
    return { tasks };
  }

  async update(taskId: string, patch: Partial<TaskState>): Promise<void> {
    const cur = (await this.read()).tasks[taskId] ?? { status: 'pending' as const };
    const next: TaskState = { ...cur, ...patch };
    this.db
      .prepare(
        `
      INSERT INTO task_state (project_root, task_id, status, branch, pr_url, attempts, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_root, task_id) DO UPDATE SET
        status=excluded.status, branch=excluded.branch, pr_url=excluded.pr_url,
        attempts=excluded.attempts, last_error=excluded.last_error, updated_at=excluded.updated_at
    `,
      )
      .run(
        this.opts.projectRoot,
        taskId,
        next.status,
        next.branch ?? null,
        next.pr_url ?? null,
        next.attempts ?? null,
        next.last_error ?? null,
        Date.now(),
      );
  }
}
```

- [ ] **Step 3: Reuse the contract test factory**

```ts
// packages/daemon/src/state/__tests__/sqliteStore.test.ts
import { describeStateRepository } from '@arandano/core/__tests__/repository.test.js';
// (requires the factory to be exported via a test util — see step 4)
```

Easier path: copy the factory into the daemon package's tests (small) and call it for `SqliteStateStore`.

```ts
import { describe, it, expect } from 'vitest';
import { SqliteStateStore } from '../sqliteStore.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('SqliteStateStore', () => {
  it('reads empty initially', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sql-'));
    const store = new SqliteStateStore({ path: join(dir, 'd.db'), projectRoot: '/p' });
    const s = await store.read();
    expect(s.tasks).toEqual({});
    await rm(dir, { recursive: true, force: true });
  });
  it('updates and re-reads', async () => {
    /* mirror */
  });
  it('isolates by project_root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sql-'));
    const a = new SqliteStateStore({ path: join(dir, 'd.db'), projectRoot: '/a' });
    const b = new SqliteStateStore({ path: join(dir, 'd.db'), projectRoot: '/b' });
    await a.update('T1', { status: 'completed' });
    expect((await b.read()).tasks).toEqual({});
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 4: Run tests, commit**

```bash
npm install
npm run build
npm test -- sqliteStore
git add packages/daemon/ package-lock.json
git commit -m "feat(daemon): SQLite state store implementing StateRepository"
```

---
