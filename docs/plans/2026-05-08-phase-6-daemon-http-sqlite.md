# arandano Phase 6 — Daemon Mode (HTTP API + SQLite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the orchestrator core in an HTTP server so multiple laptops or scheduled jobs can dispatch tasks against a single homelab instance. State migrates from `.arandano/state.json` to SQLite owned by the daemon. The CLI grows `--remote http://homelab:8080` and uses the same subcommand surface; everything that previously ran in-process now goes over HTTP. No rewrite — the orchestrator is reused as a library.

**Architecture:** New `@arandano/daemon` package using Fastify + better-sqlite3. The daemon embeds the same `Orchestrator` class. State migrates to SQLite via a small `StateRepository` interface so both the file-based store (existing) and the SQLite store work behind the same interface. Auth is bearer-token (one shared secret for v1; OAuth deferred). The CLI gets a thin `RemoteClient` that HTTPs the daemon when `--remote` is set.

**Tech Stack:** Fastify 4, better-sqlite3 11, zod (already), node:crypto for token hashing.

**Reference spec:** `arandano-design.md` §19 (daemon evolution path), §24 Phase 6.

**Scope deferrals:**

- Multi-tenant separation — single-user daemon for v1.
- TLS termination — assume the daemon sits behind a reverse proxy (Traefik/Caddy) the user already runs on the homelab. Document but do not implement.
- Web UI — out of scope.

---

## File Structure

```
arandano/
├── packages/daemon/                                     new package
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── server.ts                                    Fastify app factory
│   │   ├── routes/{run,status,cancel,health}.ts
│   │   ├── auth.ts                                      bearer token middleware
│   │   ├── state/sqliteStore.ts                         StateRepository impl
│   │   ├── orchestratorPool.ts                          one Orchestrator per project root
│   │   ├── config.ts                                    daemon-config.yaml loader
│   │   └── __tests__/{server,sqliteStore,auth}.test.ts
│   ├── bin/
│   │   └── arandano-daemon                              `node ./dist/server.js`
│   └── deploy/
│       ├── systemd/arandano-daemon.service
│       └── compose/docker-compose.yml
├── packages/core/src/state/
│   ├── repository.ts                                    new: StateRepository interface
│   ├── fileStore.ts                                     refactor: existing StateStore → FileStateStore impl
│   └── __tests__/repository.test.ts                     contract tests
├── packages/cli/src/
│   ├── remote/
│   │   ├── RemoteClient.ts                              HTTP client to daemon
│   │   └── __tests__/RemoteClient.test.ts
│   └── commands/run.ts, status.ts, ...                  modify: route via RemoteClient when --remote
└── docs/
    └── daemon.md                                        operator guide
```

---

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

### Task 3: Auth middleware (TDD)

**Goal:** A Fastify plugin that requires `Authorization: Bearer <token>` matching one of the configured tokens (hashed at rest in the daemon config).

**Files:**

- Create: `packages/daemon/src/auth.ts`
- Create: `packages/daemon/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { bearerAuth } from '../auth.js';

describe('bearerAuth', () => {
  it('rejects requests with no token', async () => {
    const app = Fastify();
    await app.register(bearerAuth, {
      tokenHashes: [createHash('sha256').update('secret').digest('hex')],
    });
    app.get('/p', async () => 'ok');
    const r = await app.inject({ method: 'GET', url: '/p' });
    expect(r.statusCode).toBe(401);
  });
  it('accepts valid bearer', async () => {
    const app = Fastify();
    await app.register(bearerAuth, {
      tokenHashes: [createHash('sha256').update('secret').digest('hex')],
    });
    app.get('/p', async () => 'ok');
    const r = await app.inject({
      method: 'GET',
      url: '/p',
      headers: { authorization: 'Bearer secret' },
    });
    expect(r.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Implement `auth.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface BearerOpts {
  tokenHashes: string[];
}

export const bearerAuth: FastifyPluginAsync<BearerOpts> = async (app, opts) => {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const h = req.headers.authorization ?? '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return reply.code(401).send({ error: 'missing bearer' });
    const presented = createHash('sha256').update(m[1]!).digest();
    const ok = opts.tokenHashes.some((expectedHex) => {
      const expected = Buffer.from(expectedHex, 'hex');
      return expected.length === presented.length && timingSafeEqual(expected, presented);
    });
    if (!ok) return reply.code(401).send({ error: 'invalid token' });
  });
};
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- auth
git add packages/daemon/
git commit -m "feat(daemon): bearer-token auth middleware"
```

---

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

### Task 6: Daemon binary + config + systemd unit

**Goal:** `arandano-daemon` binary reads `daemon-config.yaml` and starts the server. systemd unit and docker-compose deploy options ship in `deploy/`.

**Files:**

- Create: `packages/daemon/src/bin.ts`
- Create: `packages/daemon/src/config.ts`
- Create: `packages/daemon/deploy/systemd/arandano-daemon.service`
- Create: `packages/daemon/deploy/compose/docker-compose.yml`

- [ ] **Step 1: Implement `config.ts`**

```ts
import { readFile } from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';

const Schema = z.object({
  listen: z.object({ host: z.string().default('0.0.0.0'), port: z.number().int().default(8080) }),
  db_path: z.string().default('/var/lib/arandano/daemon.db'),
  tokens: z.array(z.string()).min(1), // sha256 hex hashes
});

export type DaemonConfig = z.infer<typeof Schema>;

export async function loadDaemonConfig(path: string): Promise<DaemonConfig> {
  const text = await readFile(path, 'utf8');
  return Schema.parse(yaml.parse(text));
}
```

- [ ] **Step 2: Implement `bin.ts`**

```ts
#!/usr/bin/env node
import { loadDaemonConfig } from './config.js';
import { buildServer } from './server.js';

const cfgPath = process.env.ARANDANO_DAEMON_CONFIG ?? '/etc/arandano/daemon.yaml';
const cfg = await loadDaemonConfig(cfgPath);
const app = await buildServer({ tokenHashes: cfg.tokens, dbPath: cfg.db_path });
await app.listen({ host: cfg.listen.host, port: cfg.listen.port });
```

- [ ] **Step 3: Author `deploy/systemd/arandano-daemon.service`**

```ini
[Unit]
Description=arandano daemon
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=arandano
Environment=ARANDANO_DAEMON_CONFIG=/etc/arandano/daemon.yaml
ExecStart=/usr/local/bin/arandano-daemon
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Author `deploy/compose/docker-compose.yml`**

```yaml
services:
  daemon:
    image: ghcr.io/nmunozsi/arandano-daemon:latest
    restart: unless-stopped
    environment:
      ARANDANO_DAEMON_CONFIG: /etc/arandano/daemon.yaml
    volumes:
      - ./daemon.yaml:/etc/arandano/daemon.yaml:ro
      - arandano-data:/var/lib/arandano
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - '8080:8080'
volumes:
  arandano-data:
```

- [ ] **Step 5: Build, smoke-test locally, commit**

```bash
npm run build
ARANDANO_DAEMON_CONFIG=./examples/daemon.yaml node ./packages/daemon/dist/bin.js &
curl -fsS http://localhost:8080/healthz
```

```bash
git add packages/daemon/
git commit -m "feat(daemon): bin + config + systemd unit + compose template"
```

---

### Task 7: `RemoteClient` and CLI `--remote` flag

**Goal:** When `--remote http://...` is set on any subcommand, the CLI HTTPs the daemon instead of running in-process.

**Files:**

- Create: `packages/cli/src/remote/RemoteClient.ts`
- Create: `packages/cli/src/remote/__tests__/RemoteClient.test.ts`
- Modify: `packages/cli/src/commands/{run,status,cancel}.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { RemoteClient } from '../RemoteClient.js';

describe('RemoteClient', () => {
  it('passes Authorization header on every call', async () => {
    let seen = '';
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen = String((init as { headers?: Record<string, string> }).headers?.authorization ?? '');
      return new Response(JSON.stringify({ tasks: {} }), { status: 200 });
    };
    try {
      const c = new RemoteClient({ baseUrl: 'http://x', token: 'abc' });
      await c.state('/p');
      expect(seen).toBe('Bearer abc');
    } finally {
      globalThis.fetch = orig;
    }
  });
});
```

- [ ] **Step 2: Implement `RemoteClient.ts`**

```ts
export interface RemoteClientOpts {
  baseUrl: string;
  token: string;
}

export class RemoteClient {
  constructor(private readonly opts: RemoteClientOpts) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${this.opts.token}`,
        'content-type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  state(projectRoot: string) {
    return this.req<{ tasks: Record<string, { status: string }> }>(
      `/v1/state?projectRoot=${encodeURIComponent(projectRoot)}`,
    );
  }
  startRun(body: { projectRoot: string; planSlug?: string; taskId?: string }) {
    return this.req<{ runId: string }>('/v1/runs', { method: 'POST', body: JSON.stringify(body) });
  }
  pollRun(runId: string) {
    return this.req<{
      status: string;
      summary?: { completed: string[]; failed: string[]; skipped: string[] };
    }>(`/v1/runs/${runId}`);
  }
}
```

- [ ] **Step 3: Wire `--remote` into commands**

In `run.ts`:

```ts
static override flags = {
  plan: Flags.string({ description: '...' }),
  remote: Flags.string({ description: 'http://daemon:8080 — dispatch via daemon' }),
};

async run(): Promise<void> {
  const { args, flags } = await this.parse(Run);
  if (flags.remote) {
    const token = process.env.ARANDANO_TOKEN;
    if (!token) throw new Error('ARANDANO_TOKEN required when using --remote');
    const client = new RemoteClient({ baseUrl: flags.remote, token });
    const { runId } = await client.startRun({ projectRoot: process.cwd(), planSlug: flags.plan, taskId: args.taskId });
    this.log(`run started: ${runId}`);
    let status = await client.pollRun(runId);
    while (status.status === 'pending') {
      await new Promise((r) => setTimeout(r, 3000));
      status = await client.pollRun(runId);
    }
    this.log(JSON.stringify(status.summary, null, 2));
    return;
  }
  // existing in-process path
}
```

Same shape for `status.ts`.

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add packages/cli/
git commit -m "feat(cli): --remote routes commands through the daemon"
```

---

### Task 8: Operator guide

**Goal:** `docs/daemon.md` covering install (systemd or compose), config, token management, and rolling restarts.

- [ ] **Step 1: Author `docs/daemon.md`**

````markdown
# Running arandano as a daemon on the homelab

## Install (systemd)

```bash
# 1. Create user + dirs
sudo useradd -r -s /usr/sbin/nologin arandano
sudo install -d -o arandano -g arandano /var/lib/arandano /etc/arandano

# 2. Drop the binary
curl -fsSL https://github.com/nmunozsi/arandano/releases/latest/download/arandano-daemon-linux-x64 -o /usr/local/bin/arandano-daemon
sudo chmod +x /usr/local/bin/arandano-daemon

# 3. Author /etc/arandano/daemon.yaml
listen: { host: 0.0.0.0, port: 8080 }
db_path: /var/lib/arandano/daemon.db
tokens:
  - <sha256 hex of your token>     # generate: echo -n "your-token" | sha256sum

# 4. Install and start the unit
sudo cp ./packages/daemon/deploy/systemd/arandano-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now arandano-daemon
```
````

## Verify

```bash
curl -fsS http://homelab:8080/healthz
```

## Use from a laptop

```bash
export ARANDANO_TOKEN=<your raw token>
arandano --remote http://homelab:8080 status
arandano --remote http://homelab:8080 run --plan=2026-05-08-feat-x
```

## Token rotation

Add a new sha256 hash under `tokens:`, restart, share the new raw token, then remove the old hash and restart again. No downtime.

## Backups

`/var/lib/arandano/daemon.db` is the only stateful artifact. `cp` it while the daemon is stopped, or use SQLite's `.backup` via cron.

````

- [ ] **Step 2: Commit**

```bash
git add docs/daemon.md
git commit -m "docs: daemon operator guide"
````

---

### Task 9: End-to-end with a real daemon on the homelab

- [ ] **Step 1: Build and ship the daemon**

```bash
npm run build
scp packages/daemon/dist/bin.js homelab:/tmp/arandano-daemon
ssh homelab 'sudo install /tmp/arandano-daemon /usr/local/bin/arandano-daemon'
```

(Or use the compose deploy.)

- [ ] **Step 2: Configure tokens and start**

Follow the operator guide.

- [ ] **Step 3: Drive a task from a laptop**

```bash
export ARANDANO_TOKEN=...
arandano --remote http://homelab:8080 run T1
```

Expected: same outcome as in-process — PR opens.

- [ ] **Step 4: Document in examples**

Append a daemon section to `arandano-examples/README.md` linking the PR opened via daemon.

---

## Phase 6 done — exit criteria

- [ ] `@arandano/daemon` runs as a systemd service on the homelab
- [ ] `arandano --remote http://homelab:8080 ...` works for `run`, `status`, `cancel`
- [ ] State is persisted in SQLite, isolated by `project_root`
- [ ] Bearer-token auth covers all routes except `/healthz`
- [ ] At least one task is dispatched via the daemon end-to-end and lands a PR

After this, the next plan covers **Phase 7 — auto-planner skill (`arandano:decomposing-plan-into-tasks`)**.
