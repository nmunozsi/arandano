> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T4-http-api-surface.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md                                      ← you are here
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 4: HTTP API surface (TDD)

**Goal:** Routes that mirror the in-process CLI. v1 surface:

- `POST /v1/runs` — body `{ projectRoot, planSlug?, taskId? }` — returns `{ runId }`
- `GET /v1/runs/:runId` — returns status snapshot
- `POST /v1/runs/:runId/cancel`
- `GET /v1/state?projectRoot=...` — returns the full RunState
- `GET /healthz` — unauthenticated

**Files:**

- Create: `packages/daemon/src/routes/{health,run,state}.ts`
- Create: `packages/daemon/src/server.ts`
- Create: `packages/daemon/src/orchestratorPool.ts`
- Create: `packages/daemon/src/__tests__/server.test.ts`

- [ ] **Step 1: Write the failing API test**

```ts
import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

describe('daemon HTTP', () => {
  it('healthz is open', async () => {
    const app = await buildServer({ tokenHashes: [], dbPath: ':memory:' });
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.statusCode).toBe(200);
  });

  it('GET /v1/state requires bearer', async () => {
    const app = await buildServer({
      tokenHashes: [
        /* sha256 */
      ],
      dbPath: ':memory:',
    });
    const r = await app.inject({ method: 'GET', url: '/v1/state?projectRoot=/p' });
    expect(r.statusCode).toBe(401);
  });

  it('GET /v1/state returns empty initially when authed', async () => {
    /* …as above with valid bearer… */
  });
});
```

- [ ] **Step 2: Implement `server.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { bearerAuth } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { runRoutes } from './routes/run.js';
import { stateRoutes } from './routes/state.js';
import { OrchestratorPool } from './orchestratorPool.js';

export interface ServerOpts {
  tokenHashes: string[];
  dbPath: string;
}

export async function buildServer(opts: ServerOpts): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(bearerAuth, { tokenHashes: opts.tokenHashes });
  await app.register(healthRoutes);
  const pool = new OrchestratorPool({ dbPath: opts.dbPath });
  app.decorate('pool', pool);
  await app.register(runRoutes);
  await app.register(stateRoutes);
  return app;
}
```

- [ ] **Step 3: Implement routes** (sketch — the orchestrator pool keeps a registry of in-flight runs by id)

`routes/health.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => ({ ok: true }));
};
```

`routes/run.ts` and `routes/state.ts` use the pool. (Pool holds a map of `runId → { promise, summary?, cancel(): void }`.)

- [ ] **Step 4: Run tests, commit**

```bash
npm test -- daemon
git add packages/daemon/
git commit -m "feat(daemon): HTTP routes for runs and state"
```

---
