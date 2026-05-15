> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T5-orchestratorpool-in-flight-run-tracking.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md               ← you are here
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 5: `OrchestratorPool` — in-flight run tracking

**Goal:** A registry that maps `runId → Promise<RunSummary>`, so `POST /v1/runs` returns immediately with an id and `GET /v1/runs/:runId` resolves it.

**Files:**

- Create: `packages/daemon/src/orchestratorPool.ts`
- Create: `packages/daemon/src/__tests__/orchestratorPool.test.ts`

- [ ] **Step 1: Write the failing test (pool returns summary after promise resolves)**

```ts
import { describe, expect, it, vi } from 'vitest';
import { OrchestratorPool } from '../orchestratorPool.js';
import type { Executor } from '@arandano/core';

const okExec = (): Executor =>
  ({
    /* trivial mock */
  }) as never;

describe('OrchestratorPool', () => {
  it('starts a run and resolves to a summary', async () => {
    const pool = new OrchestratorPool({ dbPath: ':memory:' });
    const runId = await pool.start({
      projectRoot: '/p',
      planSlug: 'p',
      executorFactory: () => okExec(),
      runOrchestrator: async () => ({ completed: ['T1'], failed: [], skipped: [] }),
    });
    const result = await pool.wait(runId);
    expect(result.completed).toEqual(['T1']);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { randomUUID } from 'node:crypto';
import type { Executor } from '@arandano/core';

export interface RunSummary {
  completed: string[];
  failed: string[];
  skipped: string[];
}

export interface StartOpts {
  projectRoot: string;
  planSlug: string;
  executorFactory: () => Executor;
  runOrchestrator: (e: Executor) => Promise<RunSummary>;
}

export class OrchestratorPool {
  private readonly inflight = new Map<string, Promise<RunSummary>>();
  private readonly results = new Map<string, RunSummary>();

  constructor(private readonly opts: { dbPath: string }) {}

  async start(o: StartOpts): Promise<string> {
    const runId = randomUUID();
    const exec = o.executorFactory();
    const p = (async () => {
      const r = await o.runOrchestrator(exec);
      this.results.set(runId, r);
      return r;
    })();
    this.inflight.set(runId, p);
    return runId;
  }

  wait(runId: string): Promise<RunSummary> {
    const cached = this.results.get(runId);
    if (cached) return Promise.resolve(cached);
    const p = this.inflight.get(runId);
    if (!p) return Promise.reject(new Error(`unknown run: ${runId}`));
    return p;
  }

  status(runId: string): 'pending' | 'completed' | 'unknown' {
    if (this.results.has(runId)) return 'completed';
    if (this.inflight.has(runId)) return 'pending';
    return 'unknown';
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- orchestratorPool
git add packages/daemon/
git commit -m "feat(daemon): OrchestratorPool tracks in-flight runs"
```

---
