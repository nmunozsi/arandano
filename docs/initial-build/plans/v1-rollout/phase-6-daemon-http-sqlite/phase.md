> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/phase.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md                                                    ← you are here
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

# arandano Phase 6 — Daemon Mode (HTTP API + SQLite) Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — **critical: the existing `StateStore.update` takes a callback, not `(taskId, patch)`, and the existing `TaskStatus`/`TaskState` shapes differ from Task 1's drafts.** Task 1 must preserve the callback API.

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

## Phase 1 reality check (2026-05-11)

This phase refactors Phase 1's `StateStore`. **The Task 1 draft below has major drift** from what's actually in `packages/core/src/state/store.ts` and `packages/core/src/types/state.ts`. Read this section first.

**Locked-in Phase 1 surfaces — these must be preserved unchanged or explicitly migrated:**

- `StateStore.update` — `packages/core/src/state/store.ts:22` — **callback-based, not patch-based**:
  ```ts
  async update(updater: (state: RunState) => void | Promise<void>): Promise<RunState>
  ```
  The implementation uses an internal promise-chain lock (lines 34-43) and atomic temp-file rename (lines 45-64). The orchestrator uses it like:
  ```ts
  await store.update((state) => {
    state.tasks[taskRun.taskId] = { retry_count: existing?.retry_count ?? 0, status: 'running', ... };
  });
  ```
  **Do not introduce an `update(taskId, patch)` shape — that would force every existing caller (`runOne.ts` lines 44-50, 55-63) to be rewritten and lose the atomicity guarantee.**
- `RunState` — `packages/core/src/types/state.ts:13-15`:
  ```ts
  export interface RunState {
    tasks: Record<string, TaskState>;
  }
  ```
- `TaskStatus` — `packages/core/src/types/state.ts:1`:
  ```ts
  export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  ```
  Task 1's draft has `'pending' | 'ready' | 'in_progress' | 'completed' | 'failed' | 'partial'` — **wrong**. `in_progress` was decided against during Phase 1; the value is `running`. Don't introduce `ready` or `partial` without a Phase 1 migration.
- `TaskState` — `packages/core/src/types/state.ts:3-11`:
  ```ts
  export interface TaskState {
    status: TaskStatus;
    branch?: string;
    pr_url?: string;
    retry_count: number; // required, not optional
    error?: string; // not `last_error`
    started_at?: string;
    finished_at?: string;
  }
  ```
  Task 1's draft has `attempts?: number` and `last_error?: string` — **wrong field names**. The real fields are `retry_count` (required) and `error`. Also `started_at`/`finished_at` are real fields that Task 1 omitted.
- Existing core export surface — `packages/core/src/index.ts` exports `StateStore` (not `FileStateStore`). The rename in Task 1 Step 2 is fine but must keep both names exported for back-compat (Task 1 already calls this out — preserve it).
- CLI commands list — `packages/cli/src/commands/`: `init.ts`, `run.ts`, `version.ts`. Phase 2 adds `status.ts`, `retry.ts`, `cleanup.ts`, `doctor.ts`, `memory/*`, `issue/*`. The `--remote` flag only makes sense on commands that mutate or query daemon state.
- CLI exit-code idiom: `process.exit(code)` (not `this.exit(code)`).

**Per-task corrections:**

- **Task 1, Step 1** (`repository.ts`): rewrite the interface to preserve the callback API:
  ```ts
  // packages/core/src/state/repository.ts
  import type { RunState } from '../types/state.js';
  export interface StateRepository {
    read(): Promise<RunState>;
    update(updater: (state: RunState) => void | Promise<void>): Promise<RunState>;
  }
  ```
  Do **not** re-export `RunState`/`TaskState`/`TaskStatus` from here — they already live in `../types/state.ts`. Just `import type` them in the interface.
- **Task 1, Step 2** (rename `store.ts` → `fileStore.ts`): the existing `StateStore` class already matches the callback signature, so the rename is straightforward — change `class StateStore` to `class FileStateStore implements StateRepository`, then add `export { FileStateStore as StateStore };` for back-compat. The plan's `import {} from /* existing impl */ '...'` placeholder is a placeholder failure — fill in the actual move with the existing implementation preserved verbatim.
- **Task 1, Step 3** (contract test factory): test names that reference `'in_progress'`, `'ready'`, `attempts`, or `last_error` are wrong. Match Phase 1's `TaskState` exactly: `{ retry_count: 0, status: 'running' }`, etc.
- **Task 2** (SQLite store): the `update` method must accept the callback and execute it inside a transaction:
  ```ts
  async update(updater: (state: RunState) => void | Promise<void>): Promise<RunState> {
    return this.db.transaction(async () => {
      const state = await this.read();
      await updater(state);
      await this.write(state);
      return state;
    })();
  }
  ```
  Use `better-sqlite3`'s sync `.transaction()` wrapper if you stay sync; if you need async, hand-roll BEGIN/COMMIT around the read+write.
- **Task 2** (SQLite schema): one row per `(project_root, task_id)`. The columns should mirror `TaskState` fields: `status`, `branch`, `pr_url`, `retry_count`, `error`, `started_at`, `finished_at`. Read deserializes a row → `TaskState`; write upserts.
- **Task 5** (`OrchestratorPool`): the `Orchestrator` class is created in Phase 2 (not Phase 1). Don't reference it before Phase 2 lands; sequence Phase 6 after Phase 2 Task 3.
- **Task 7** (`RemoteClient` + `--remote` flag): the only Phase 1 command that needs `--remote` wiring initially is `run` (`init` and `version` are local-only). Phase 2 commands `status`, `retry`, `cleanup`, `doctor`, `memory promote`, `issue *` all also need it.
- **All new commands/extensions**: use `process.exit(code)`, not `this.exit(code)`.
- **Sequencing**: Phase 6 depends on Phase 2's `Orchestrator` class existing. Don't attempt this phase until Phase 2 Task 3 is shipped.

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

## Tasks

- [ ] [T1 — Extract `StateRepository` interface (refactor with tests)](T1-extract-staterepository-interface.md)
- [ ] [T2 — SQLite state store (TDD via the contract suite)](T2-sqlite-state-store.md)
- [ ] [T3 — Auth middleware (TDD)](T3-auth-middleware.md)
- [ ] [T4 — HTTP API surface (TDD)](T4-http-api-surface.md)
- [ ] [T5 — `OrchestratorPool` — in-flight run tracking](T5-orchestratorpool-in-flight-run-tracking.md)
- [ ] [T6 — Daemon binary + config + systemd unit](T6-daemon-binary-config-systemd-unit.md)
- [ ] [T7 — `RemoteClient` and CLI `--remote` flag](T7-remoteclient-and-cli-remote-flag.md)
- [ ] [T8 — Operator guide](T8-operator-guide.md)
- [ ] [T9 — End-to-end with a real daemon on the homelab](T9-end-to-end-with-a-real-daemon-on-the-homelab.md)

---

## Exit criteria

## Phase 6 done — exit criteria

- [ ] `@arandano/daemon` runs as a systemd service on the homelab
- [ ] `arandano --remote http://homelab:8080 ...` works for `run`, `status`, `cancel`
- [ ] State is persisted in SQLite, isolated by `project_root`
- [ ] Bearer-token auth covers all routes except `/healthz`
- [ ] At least one task is dispatched via the daemon end-to-end and lands a PR

After this, the next plan covers **Phase 7 — auto-planner skill (`arandano:decomposing-plan-into-tasks`)**.
