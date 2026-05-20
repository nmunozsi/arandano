> **Location:** `docs/gitnexus-context/spec.md`
>
> **Folder structure:**
>
> ```
> gitnexus-context/
> ├── spec.md          ← you are here
> └── plans/
>     └── v1-architect/  (implementation plan, written alongside this spec)
> ```

---

title: GitNexus context — code-graph MCP for architect and worker
status: approved, ready for implementation
author: nmunozsi (with Claude)
date: 2026-05-19

---

# GitNexus context

## Overview

The architect and coder roles today see only Markdown plan files, per-task plan-context (branches and PR URLs from `architect-plan-context` v1), and whatever `git diff` they fetch on demand. They have no structural view of the code: no call-graph, no dependency map, no blast-radius signal when a function changes. As the project grows beyond `node-ts-toy`, the architect's `docs/architecture.md` refreshes and the coder's edits both miss cross-cutting impact that a code graph would surface immediately.

This spec adds [GitNexus](https://github.com/abhigyanpatwari/GitNexus) — a Tree-sitter-based code intelligence engine that builds a graph of a codebase and exposes it as an MCP server — to the worker image, so Claude Code can query the graph during architect and coder runs.

**Cache-warming responsibility lives on the orchestrator (host), not in the worker.** A host-installed `gitnexus` builds `.gitnexus/` before each task that needs it. Workers verify the cache is ready and wire the MCP server; they never run `gitnexus analyze` themselves. This keeps analyze cost out of the worker critical path and naturally eliminates the v2 concurrency race (multiple workers analyzing the same workspace simultaneously) without locking.

Delivery is staged across two plans:

1. **v1 — architect-only.** Bake GitNexus into the worker image, add a host-side cache pre-warm in the orchestrator, wire MCP for the synthetic `T-architect` task, validate end-to-end on `node-ts-toy`.
2. **v2 — worker (coder tasks).** Extend opt-in to coder tasks via the existing `mcp:` task frontmatter slot. Planned after v1 lands.

This spec covers **v1 only**. v2 is sketched in §11 for context but will have its own spec/plan once v1 has shipped.

## Non-goals

- Replacing `plan-context.json` from `architect-plan-context` v1 — gitnexus context is additive.
- Real-time / incremental graph updates as files change inside a run (GitNexus doesn't ship incremental indexing yet; the cache is HEAD-granular).
- Sidecar containers, custom networking, or MCP-over-HTTP bridges (GitNexus MCP is stdio-only; the canonical deployment is in-container).
- Shrinking the worker image by removing gitnexus — the binary is still needed in-container to serve `gitnexus mcp` to Claude.
- Hard-failing `arandano run` when host gitnexus is missing — the orchestrator logs a warning and dispatches tasks without graph context (soft-fail invariant).
- Automated CI testing of the full Docker integration (existing repo posture is to validate Docker-dependent flows manually).
- Coder-task opt-in (deferred to v2).

## License note

GitNexus is licensed under **PolyForm Noncommercial**. arandano's current use (personal/research/dev tooling) falls within the allowed scope. If arandano ever offers commercial hosted runs, the GitNexus dependency requires a separate commercial license or a substitution.

## Architecture

The orchestrator runs on the user's host machine. Before any task with `mcp: ['gitnexus']` is dispatched, the orchestrator checks `.gitnexus/.head-stamp` against `git rev-parse HEAD`. On a stale or missing stamp, it shells out to the host-installed `gitnexus analyze`. On a fresh stamp, it does nothing — the cache is already warm.

The worker image (`ghcr.io/nmunozsi/arandano-worker:latest`) bakes in the GitNexus CLI. When the orchestrator dispatches `T-architect` with `mcp: ['gitnexus']` on its synthesized frontmatter, the worker:

1. `verifyGitnexusCache(workspace)` — pure check: `.gitnexus/` exists and stamp matches HEAD? If not, log it and skip MCP wiring (the run continues without graph context).
2. `writeRegistryEntry(workspace)` — defensive single-line write to `~/.gitnexus/registry.json` inside the container, pointing at the bind-mounted workspace. Sidesteps the unknown about whether `gitnexus mcp` discovers `.gitnexus/` in `cwd` without a registry entry.
3. `writeMcpConfig(workspace, ['gitnexus'])` — writes `.claude/mcp.json` declaring `gitnexus mcp` as a stdio child process.
4. `invokeCli` with `--mcp-config .claude/mcp.json` — Claude spawns `gitnexus mcp` and has graph-query tools throughout the run.

The signal flow:

```
task frontmatter `mcp: [gitnexus]`
  → TaskFrontmatter.mcp
  → runOne reads it, calls ensureGitnexusCacheHost(projectRoot) on HOST
       └─ shells out to host's `gitnexus analyze` if stale; updates .head-stamp
  → TaskRun.mcpServers = ['gitnexus']
  → DockerExecutor.start(taskRun)
  → containerSpec emits `ARANDANO_MCP_SERVERS=gitnexus`
  → worker container starts (gitnexus binary baked in, but NOT used for analyze)
  → architectDriver:
       verifyGitnexusCache → writeRegistryEntry → writeMcpConfig → invokeCli(--mcp-config ...)
       └─ claude spawns `gitnexus mcp` as stdio child
```

## Components

### 1. Worker image — install gitnexus (PINNED VERSION)

**Repo:** `arandano-worker`
**File:** `Dockerfile`

Add `RUN npm install -g gitnexus@<PINNED_VERSION>` so the `gitnexus` binary is on PATH for the `worker` user (UID 1001). Run a sanity `RUN gitnexus --version` at build time to fail-fast if the install breaks.

**Version pinning is required**, not optional. The host's `gitnexus analyze` (writing `.gitnexus/`) and the worker's `gitnexus mcp` (reading `.gitnexus/`) must agree on the on-disk schema. The pinned version is documented in:

- `arandano-worker/Dockerfile` (worker image)
- `arandano/README.md` (host install command for users)
- `arandano/packages/core/src/mcp/cacheHost.ts` as a constant referenced in error messages

The image must continue to run as the existing `worker` user — no privilege escalation, no new bind-mount requirements.

### 2. Worker — MCP helpers module (new)

**Repo:** `arandano-worker`
**Files:**

- `lib/src/mcp/cache.ts` (new — verify-only)
- `lib/src/mcp/registry.ts` (new — registry poke)
- `lib/src/mcp/config.ts` (new — write mcp.json)
- `lib/src/mcp/__tests__/cache.test.ts` (new)
- `lib/src/mcp/__tests__/registry.test.ts` (new)
- `lib/src/mcp/__tests__/config.test.ts` (new)

**`verifyGitnexusCache(workspaceRoot): Promise<'cache-hit' | 'stale' | 'missing' | 'skipped'>`** — pure read: checks `gitnexus` is on PATH (sanity, returns `'skipped'` if absent); reads `.gitnexus/.head-stamp` and compares to `git rev-parse HEAD`. Returns `'cache-hit'` (match), `'stale'` (mismatch), or `'missing'` (no `.gitnexus/`). Never runs analyze. Never throws.

**`writeRegistryEntry(workspaceRoot): Promise<void>`** — writes `~/.gitnexus/registry.json` inside the container with one entry pointing at the bind-mounted workspace. The exact schema is reverse-engineered from the host's `.gitnexus/` (see T5 §spike). Idempotent. Never throws.

**`writeMcpConfig(workspaceRoot, servers): Promise<string>`** — writes `<workspaceRoot>/.claude/mcp.json` declaring the requested MCP servers. For `gitnexus`, the entry is `{ command: 'gitnexus', args: ['mcp'] }`. Returns the workspace-relative path to the written file.

All three helpers are pure utilities; they take a workspace root and don't reach into `process.env` themselves.

### 3. Worker — architectDriver wires it in

**Repo:** `arandano-worker`
**File:** `lib/src/architect/architectDriver.ts`

After the existing `createBranch` step and before `invokeCli`, the driver:

1. Reads `process.env.ARANDANO_MCP_SERVERS` — if empty/absent, skip MCP entirely.
2. If `'gitnexus'` is in the list, call `verifyGitnexusCache(workspace)` and log the result to journal.
3. If the result is `'cache-hit'`, call `writeRegistryEntry(workspace)`, then `writeMcpConfig(workspace, ['gitnexus'])`, then add `--mcp-config <path>` to the `invokeCli` args.
4. If the result is `'stale'`, `'missing'`, or `'skipped'`, do NOT wire MCP — the run proceeds without graph context. The architect prompt's "no task context available" branch already handles the degraded path.

`invokeClaudeCode.ts` gains an optional `mcpConfigPath?: string` field on `InvokeCliOpts` that, when set, appends `['--mcp-config', mcpConfigPath]` to the CLI args. The architect driver uses it; the coder driver will use it in v2.

### 4. Orchestrator — synthesized architect task carries `mcp`

**Repo:** `arandano` (monorepo)
**File:** `packages/core/src/architect/synthesizeArchitectTask.ts`

The returned `TaskFrontmatter` gains `mcp: ['gitnexus']`. The synthesized task already has `id: 'T-architect'`, `role: 'architect'`, and `depends_on: [...]`; this just adds one field.

### 5. Executor — forward `mcpServers` to the container

**Repo:** `arandano` (monorepo)
**File:** `packages/executors-docker/src/containerSpec.ts`

`TaskRun.mcpServers` is already populated by `runOne` (it maps `taskMd.frontmatter.mcp ?? []`) but the docker executor currently ignores it. Add one line that emits `ARANDANO_MCP_SERVERS=<comma-joined>` into the container env when `mcpServers.length > 0`. Absent when empty.

### 6. Orchestrator — host-side cache pre-warm (new)

**Repo:** `arandano` (monorepo)
**Files:**

- `packages/core/src/mcp/cacheHost.ts` (new)
- `packages/core/src/mcp/__tests__/cacheHost.test.ts` (new)
- `packages/core/src/orchestrator/runOne.ts` (modified)
- `packages/core/src/orchestrator/__tests__/runOne.test.ts` (modified)

**`ensureGitnexusCacheHost(workspaceRoot, opts?): Promise<CacheResult>`** — host-side counterpart to the worker's `verifyGitnexusCache`. The "ensure" variant DOES run analyze when stale, via `execFile('gitnexus', ['analyze'], { cwd: workspaceRoot, timeout: 5min })`. On success, writes `.gitnexus/.head-stamp = <head>`. On failure, deletes the stamp so the next run retries. Returns `'cache-hit' | 'rebuilt' | 'skipped' | 'failed'`. Soft-fail: never throws, logs to stderr via the `opts.log` callback (orchestrator wires this to its existing logger).

**`runOne` integration:** Before calling `executor.start(taskRun)`, if `taskRun.mcpServers.includes('gitnexus')`, call `ensureGitnexusCacheHost(projectRoot)`. On any non-`'cache-hit'`/`'rebuilt'` result, log a warning but continue dispatching the task — the worker will detect the missing/stale cache and skip MCP wiring gracefully.

**Trade-off acknowledged:** This re-introduces host-side shell-outs to the orchestrator (specifically: `gitnexus analyze` and `git rev-parse HEAD`). The `architect-plan-context` v1 spec explicitly restored the "orchestrator is a pure TypeScript scheduler" invariant by removing `gitMergeRange`. We are intentionally breaking that invariant for v1 of gitnexus-context — the alternative (per-worker analyze with a race in v2) is worse. The new shell-outs are contained to `packages/core/src/mcp/cacheHost.ts`; the orchestrator itself remains git-free.

### 7. `arandano doctor` — gitnexus availability check (new, advisory)

**Repo:** `arandano` (monorepo)
**File:** `packages/cli/src/commands/doctor.ts`

Add an **advisory** check:

```
gitnexus available (advisory)
```

The existing `tryCheck` helper returns `{ ok, detail }`. Extend the shape with `advisory?: boolean`. The final `process.exit(1)` computation excludes advisory failures from its sum. Output formatting prepends `warn` (instead of `FAIL`) for advisory failures:

```
ok    docker available
ok    gh authenticated
warn  gitnexus available (advisory) — gitnexus not on PATH; run `npm install -g gitnexus@<PINNED_VERSION>`
ok    config.yaml present
ok    git working tree clean
```

Non-advisory failures still cause `exit(1)`; advisory failures do not.

### 8. Workspace hygiene

Two paths are written by the worker that should not be committed:

- `.gitnexus/` — the indexed graph cache (rebuildable; written by host now, but lives in the workspace).
- `.claude/mcp.json` — per-run MCP config file (regenerated every run).

The `arandano init` template (`packages/templates/`) should add both to the scaffolded `.gitignore`. Existing projects are responsible for their own gitignore; we document this in CLAUDE.md but don't block v1.

For the canonical `node-ts-toy` example project, v1 includes one chore commit to add `.gitnexus/` and `.claude/` to its `.gitignore`.

## Data flow

```
arandano run --plan=<slug>
  │
  ├── Orchestrator builds DAG including T-architect (mcp: ['gitnexus'])
  │
  ├── for each task in ready batch:
  │     └── runOne(task)
  │           │
  │           ├── if task.mcpServers.includes('gitnexus'):
  │           │     └── ensureGitnexusCacheHost(projectRoot)   [HOST SHELL-OUT]
  │           │           ├── reads .gitnexus/.head-stamp
  │           │           ├── compares to git rev-parse HEAD (host)
  │           │           ├── if stale/missing: runs `gitnexus analyze` (host)
  │           │           └── writes new stamp on success
  │           │
  │           └── DockerExecutor.start(taskRun)
  │                 └── containerSpec emits ARANDANO_MCP_SERVERS=gitnexus
  │                       └── worker container starts (gitnexus baked in, NOT analyzing)
  │                             └── architectDriver:
  │                                   1. git checkout defaultBranch
  │                                   2. createBranch agent/T-architect-<ts>
  │                                   3. verifyGitnexusCache(workspace)
  │                                         - reads .gitnexus/.head-stamp (bind-mounted)
  │                                         - compares to git rev-parse HEAD (container)
  │                                         - returns 'cache-hit' (expected) | 'stale' | 'missing' | 'skipped'
  │                                   4. if 'cache-hit':
  │                                         a. writeRegistryEntry(workspace)   [defensive]
  │                                         b. writeMcpConfig(workspace, ['gitnexus'])
  │                                         c. set mcpConfigPath for invokeCli
  │                                   5. resolvePlanContext()        ← architect-plan-context v1
  │                                   6. buildArchitectPrompt(...)    ← unchanged
  │                                   7. invokeCli({ args: [..., '--mcp-config', '.claude/mcp.json'] })
  │                                         - claude spawns `gitnexus mcp` as stdio child
  │                                         - graph tools available to the agent
  │                                   8. git diff docs/architecture.md → no-op detection
  │                                   9. writeResult(result.json)
```

## Error handling

Principle: **GitNexus is auxiliary context, not a hard dependency.** Any pipeline failure logs to its logger/journal and the run continues without graph context.

| Failure                                                 | Detection                                             | Behavior                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Host: `gitnexus` binary missing                         | `gitnexusOnHost()` returns false                      | Log `gitnexus: skipped (not installed on host — see arandano doctor)`; orchestrator dispatches anyway; worker sees `'missing'` cache; no MCP. |
| Host: `gitnexus analyze` exits non-zero                 | `execFile` rejects                                    | Log first 500 chars of stderr; delete `.gitnexus/.head-stamp`; return `'failed'`; orchestrator dispatches anyway.                             |
| Host: `gitnexus analyze` exceeds 5-minute timeout       | `execFile({ timeout })`                               | Same as exit non-zero.                                                                                                                        |
| Host: `git rev-parse HEAD` fails (not a repo)           | `execFile` rejects                                    | Return `'skipped'`; orchestrator dispatches anyway; this is unlikely in a real run.                                                           |
| Worker: `gitnexus` binary missing in image              | `verifyGitnexusCache` `which` check fails             | Return `'skipped'`; no MCP wiring; run continues. Indicates a broken image build (T4 sanity check should prevent).                            |
| Worker: cache is `'stale'` or `'missing'`               | stamp mismatch / no `.gitnexus/`                      | Log it; no MCP wiring; run continues. Typically means the orchestrator-side analyze failed or was skipped.                                    |
| Worker: MCP server fails to start when claude spawns it | claude logs MCP connection error                      | We don't intercept; claude continues with its other tools; architect prompt already handles "no graph" gracefully.                            |
| Worker: registry-poke schema drift (gitnexus upgraded)  | Empty/invalid registry; `gitnexus mcp` serves nothing | Claude can't query the graph; architect run still completes. Mitigation: version pinning (§1).                                                |
| Worker: HEAD moves during run                           | We snapshot HEAD at step 3                            | Accepted — architect works against a snapshot anyway.                                                                                         |
| `.claude/mcp.json` already exists in workspace          | `writeMcpConfig` overwrites it                        | Acceptable — gitignored (§8); not a user artifact.                                                                                            |

Explicitly NOT in v1:

- Retry-with-backoff on analyze failures (host or worker).
- Telemetry on cache hit rate in `result.json`.
- Cross-run cache invalidation when `package.json` / `tsconfig.json` change (HEAD is the only staleness signal).
- Cleanup of leaked `gitnexus mcp` child processes if claude exits uncleanly.
- Concurrency lock on `.gitnexus/.head-stamp` for parallel `arandano run` invocations against the same repo (one user, one run at a time is the operating assumption).

## Open issues / risks

These are tracked but accepted for v1:

- **Registry schema is undocumented.** T5 includes a 30-minute spike to inspect the host-produced `~/.gitnexus/registry.json` and copy the shape into `writeRegistryEntry`. If the schema is too complex to reverse-engineer reliably, the fallback is to drop the registry poke and ship without it (Claude either gets the graph or doesn't — soft-fail still works).
- **Version pinning brittleness.** Host install and worker image must agree. We document the pinned version in three places (§1). If GitNexus releases a breaking schema change, we bump the pin in one PR across the monorepo + worker.
- **Host-side shell-outs in orchestrator.** Re-introduces a host gitnexus dependency on the orchestrator. Contained to `packages/core/src/mcp/cacheHost.ts`; documented in the §5 decision log entry the architect appends after this plan.

## Testing

**`arandano` monorepo — vitest:**

- `synthesizeArchitectTask`: returned task has `mcp: ['gitnexus']` when not null.
- `containerSpec`: emits `ARANDANO_MCP_SERVERS=gitnexus` when `mcpServers: ['gitnexus']`.
- `containerSpec`: emits `ARANDANO_MCP_SERVERS=gitnexus,foo` when `mcpServers: ['gitnexus', 'foo']`.
- `containerSpec`: omits `ARANDANO_MCP_SERVERS` entirely when `mcpServers: []`.
- `ensureGitnexusCacheHost`: returns `'skipped'` when host gitnexus binary missing (mocked `execFile`).
- `ensureGitnexusCacheHost`: returns `'cache-hit'` when stamp matches HEAD.
- `ensureGitnexusCacheHost`: returns `'rebuilt'` and writes stamp when `.gitnexus/` missing.
- `ensureGitnexusCacheHost`: returns `'rebuilt'` when stamp mismatches HEAD.
- `ensureGitnexusCacheHost`: returns `'failed'` and deletes stamp on analyze non-zero.
- `runOne`: calls `ensureGitnexusCacheHost` exactly once before dispatch when `mcpServers: ['gitnexus']`.
- `runOne`: does NOT call `ensureGitnexusCacheHost` when `mcpServers: []`.
- `runOne`: dispatches the task even when `ensureGitnexusCacheHost` returns `'failed'` (soft-fail).
- `doctor`: prints `warn` for the gitnexus check when binary missing; exit code is 0.
- `doctor`: prints `ok` for the gitnexus check when binary present; exit code unchanged.

**`arandano-worker/lib` — vitest:**

- `verifyGitnexusCache`: returns `'cache-hit'` when stamp matches.
- `verifyGitnexusCache`: returns `'stale'` when stamp mismatches.
- `verifyGitnexusCache`: returns `'missing'` when `.gitnexus/` absent.
- `verifyGitnexusCache`: returns `'skipped'` when gitnexus binary missing in container.
- `verifyGitnexusCache`: does NOT spawn `gitnexus analyze` under any path.
- `writeRegistryEntry`: writes a registry entry pointing at the workspace; idempotent (second call overwrites cleanly).
- `writeMcpConfig`: writes correct JSON shape to `<workspace>/.claude/mcp.json`.
- `writeMcpConfig`: creates `.claude/` directory if missing.
- `architectDriver`: with `ARANDANO_MCP_SERVERS=gitnexus` and `verifyGitnexusCache → 'cache-hit'`, calls registry + config + invokeCli with `mcpConfigPath`.
- `architectDriver`: with `ARANDANO_MCP_SERVERS` absent, does NOT pass `--mcp-config`.
- `architectDriver`: with `verifyGitnexusCache → 'stale'` or `'missing'`, does NOT pass `--mcp-config`.

**Manual integration (documented in T7, not in CI):** one full `arandano run --plan=<smoke> --with-architect` from the host against node-ts-toy with the rebuilt worker image. Verify:

1. Orchestrator log shows `gitnexus: rebuilt` on first run; `gitnexus: cache-hit` on second run with unchanged HEAD.
2. Worker journal shows `gitnexus: cache-hit` (matching the orchestrator's stamp).
3. Claude's output references at least one MCP tool call (smoke signal that the server connected to the registry).
4. PR opens normally; deleting `.gitnexus/` and rerunning still works.
5. With host gitnexus uninstalled, `arandano doctor` warns but exit code is 0; `arandano run` still completes (no graph context, but no failure).

## v2 preview (not in this plan)

Extending opt-in to coder tasks is a small follow-up:

1. **Worker driver:** lift `verifyGitnexusCache` + `writeRegistryEntry` + `writeMcpConfig` calls from `architectDriver.ts` into `driver.ts` behind the same `ARANDANO_MCP_SERVERS` check.
2. **Example task:** one coder task in `node-ts-toy` with `mcp: [gitnexus]` that explicitly invokes a graph query.
3. **Docs:** one paragraph in `CLAUDE.md` and the project README describing the opt-in pattern.

No new image changes, no new orchestrator changes. The `runOne` host pre-warm hook from §6 already triggers for any task with `gitnexus` in `mcpServers`, so v2 inherits it for free. v2 will have its own spec/plan once v1 has run for real.
