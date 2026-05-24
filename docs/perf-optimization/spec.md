> **Location:** `docs/perf-optimization/spec.md`
>
> **Folder structure:**
>
> ```
> perf-optimization/
> ├── spec.md          ← you are here
> └── plans/
> ```

# Performance Optimization — Aggressive Worker-Time Reduction (Design)

**Status**: approved, ready for implementation planning
**Author**: nmunozsi (with Claude)
**Date**: 2026-05-22
**Supersedes**: nothing
**Builds on**: `docs/perf-instrumentation/` (Phase 3 — baseline + first round of improvements)

## Goal

Phase 3 (`perf-instrumentation`) established the measurement infrastructure and applied a first round of improvements (npm cache volume, model selection, context-injection plumbing, `cli_budget_ms` advisory), reducing per-task wall time from **1,006s → 907s (−9.8%)** — short of the original ≥40% target.

This spec drives **aggressive worker-time reduction** by attacking the three dominant phases identified post-Phase 3:

| Phase             | Post-Phase 3 | % of total | Approach                                       |
| ----------------- | ------------ | ---------- | ---------------------------------------------- |
| `worker_cli_ms`   | 591s         | 65%        | Reduce prompt surface, exercise F, audit cache |
| `worker_gates_ms` | 250s         | 28%        | Parallelize                                    |
| Container startup | ~30s/task    | 3%         | Pool warm containers                           |

**Target**: per-task wall time ≤ **450s** (from the 907s baseline-as-measured) — i.e. **~55% from original baseline**, comfortably exceeding the original ≥40% goal.

Every improvement must be backed by a measured delta in `bench.csv`, not vibes. After T0 (prerequisites) Claude executes every measurement run autonomously.

## Non-goals

- Multi-provider CLI selection (OpenCode, Gemini, Codex) — deferred to a future spec (`docs/multi-provider-cli/`).
- Coverage-delta-vs-base-branch — deferred.
- Security gate as required — deferred.
- Direct Anthropic API integration in the worker (bypassing Claude Code CLI) — only investigated in T7; any actual rewrite is out of scope.

## Architecture

This spec touches five surfaces:

### 1. Worker driver (`arandano-worker/lib/src/driver.ts`)

Prompt-construction and tool-invocation changes:

- Inline role/CONTEXT/coding-standards content into `buildContextBlock`-equivalent (T4).
- Add `--disallowed-tools` to `invokeCli` args (T3).
- Fix stream-json event parser to walk the assistant-message structure (T1).
- Capture `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` from `result` events (T1).

### 2. Gate runner (`arandano-worker/lib/src/runGates.ts`)

Replace the sequential `for await` loop with `Promise.all` over read-only gates (T2). `commitMsg` runs last serially. Record both `gates_parallel_ms` and `gates_serial_sum_ms` so the speedup factor is visible.

Escape hatch: `gates.parallel: false` in `.arandano/config.yaml` forces sequential execution if needed.

### 3. Host executor (`packages/executors-docker/src/DockerExecutor.ts`)

- **Container pool** (T6): `WarmContainerPool` keyed by `(image, workdir)`. On task end, run a reset script (`git checkout <baseBranch>; git clean -fd; git reset --hard`) and return to pool. On pool full, destroy surplus. On CLI exit, stop all warm containers.
- **gitnexus skip** (T5): compare `.gitnexus/index.json` mtime with the latest source file mtime in the workspace; skip if index is newer. New bench column `host_gitnexus_skipped` (0/1).

### 4. Bench surfaces (`packages/cli/src/commands/bench.ts`, `packages/executors-docker/src/benchCsv.ts`, `packages/core/src/perf.ts`)

- New `TimingsFile` fields: `cli_input_tokens`, `cli_output_tokens`, `cli_cache_read_tokens`, `cli_cache_creation_tokens`, `gates_parallel_ms`, `gates_serial_sum_ms`, `host_gitnexus_skipped`, `host_container_reuse` (0/1).
- New `arandano bench --by-tool` view: pivots per-tool elapsed time aggregated from stream-json `tool_use` → `tool_result` pairs.

### 5. Configuration (`packages/templates/assets/config.yaml.tpl` + scaffolded `.arandano/config.yaml`)

New keys:

```yaml
executor:
  warm_pool_size: 0 # 0 = disabled (default); >0 = max warm containers in the pool
gates:
  parallel: true # set to false to force sequential (debug only)
```

CLI flags: `--warm-pool=<N>` (overrides `executor.warm_pool_size`).

## Improvements

### Group 1 — Gate parallelization

**[T2] Parallelize gates** — Replace sequential `for await` with `Promise.all` over: `format`, `lint`, `typecheck`, `test`, `coverage`, `security`. Keep `commitMsg` serial after the rest. Record speedup. **Expected Δ: −150 to −200s** (from 250s → ~50–100s depending on parallel speedup factor).

### Group 2 — CLI time reduction

**[T3a] Exercise F (context injection)** — Add `inject_context: [src/greet.ts]` (or per-task equivalent) to T4/T5/T6 frontmatter in `node-ts-toy`. Verify the worker's `buildContextBlock` is invoked and the resulting prompt prefix is non-empty. **Expected Δ: −40 to −60s** per task.

**[T3b] Trim Claude tool surface** — Pass `--disallowed-tools` to the claude CLI with: `CronCreate`, `CronDelete`, `CronList`, `NotebookEdit`, `ScheduleWakeup`, `EnterWorktree`, `ExitWorktree`, `EnterPlanMode`, `ExitPlanMode`, `PushNotification`, `WebFetch`, `WebSearch`, `RemoteTrigger`, `AskUserQuestion`. Verify with a dry run first that the flag exists in the deployed CLI version; if not, drop this sub-improvement. **Expected Δ: −10 to −30s** per task.

**[T4] Inline role + standards content in prompt** — `driver.ts` reads `.arandano/roles/<role>.md`, `src/CONTEXT.md`, `planning/memory/coding-standards.md`, `/opt/arandano/skills/gitmoji-commits/SKILL.md` from disk and prepends their content (capped at 8KB total; truncate with `[truncated, see <path> for full]` tail) to the prompt body. Remove the "Read these files" instructions from the prompt. **Expected Δ: −30 to −50s** per task.

**[T6] Container reuse pool** — `WarmContainerPool` in `DockerExecutor`. Config: `executor.warm_pool_size` (default 0 = disabled). On warm-hit, skip pull/create and reuse with a reset script. On reset failure, destroy and fall back to fresh. Track `host_container_reuse` per task. **Expected Δ: −25 to −35s** per task (warm hits only; first task per pool slot pays full cost).

**[T7] Prompt caching audit** — Read recent `cli-events.jsonl` files; aggregate `cache_read_input_tokens` and `cache_creation_input_tokens` from `result` events. Determine whether the Claude Code CLI sets `cache_control` breakpoints. Outcomes:

- **Cache hits dominate**: improvement is already free; no action needed.
- **Cache misses dominate**: file an issue upstream (anthropics/claude-code) and document the workaround for Phase 5.
- **Cache not present**: deferred to a future spec (would require direct Anthropic API path — out of scope here).

Investigation-only; no code changes in this task. **Expected Δ: 0s direct** (findings inform future work).

### Group 3 — Host time reduction

**[T5] Skip gitnexus re-index when fresh** — Before invoking `gitnexus analyze` in DockerExecutor, compare `.gitnexus/index.json` mtime with `Math.max(...sourceFile.mtime)`. Skip if the index is newer than every source file. Bench column `host_gitnexus_skipped`. **Expected Δ: −5 to −15s** per task on warm runs.

### Group 4 — Instrumentation foundation (enables measurement)

**[T1] Instrumentation foundation** —

- **Fix `cli_tool_calls` capture**: investigate the actual stream-json event schema (likely `{type:"assistant", message:{content:[{type:"tool_use",...}]}}` instead of top-level `tool_use`); rewrite `parseCliEvents` accordingly.
- **Add token tracking**: extend `TimingsFile`, `BenchRow`, `bench.ts` columns with `cli_input_tokens`, `cli_output_tokens`, `cli_cache_read_tokens`, `cli_cache_creation_tokens`. Source: stream-json `result` events.
- **Add per-tool timing**: from stream-json, correlate consecutive `tool_use` and `tool_result` events by id; sum elapsed time per tool name; expose as `arandano bench --by-tool`.
- **Add `gates_parallel_ms` / `gates_serial_sum_ms`** placeholder columns (populated in T2).

No optimization in this task — purely visibility. Must land first so every subsequent task has measured deltas. **Expected Δ: 0s direct**; unblocks attribution for T2–T6.

## Prerequisites

**[T0] One-time setup (user action)** —

1. User runs in PowerShell:

   ```powershell
   setx ANTHROPIC_API_KEY "<value>"
   setx GH_TOKEN "<value>"
   ```

   Then opens a new PowerShell window so `$env:ANTHROPIC_API_KEY` is populated.

2. Append to `CLAUDE.md` (the project root one):

   ```markdown
   ## Secrets

   - NEVER print, log, copy, echo, or otherwise output the values of these env vars:
     `ANTHROPIC_API_KEY`, `GH_TOKEN`.
   - NEVER read files matching: `secrets.env`, `.env` (except `.env.example`), `id_rsa`, `*.pem`.
   - When invoking `arandano run`, rely on inherited env vars — do not interpolate the values
     into command lines, log lines, or error messages.
   - If a tool output would contain one of these env values, redact it before continuing.
   ```

3. Verify existence (without echoing values) with:
   ```powershell
   "ANTHROPIC_API_KEY", "GH_TOKEN" | ForEach-Object {
     if (Test-Path "env:$_") { "{0}: set" -f $_ } else { "{0}: MISSING" -f $_ }
   }
   ```
   Both must read `set`. Never run `echo $env:ANTHROPIC_API_KEY` or equivalent.

After T0, every measurement step (T2–T6) is executable by Claude directly: `node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers`.

## Implementation order

Nine tasks (one per checkpoint). Tasks T2–T6 each include a measurement run as their final step.

| #      | Task                                                 | Measure after?                       | Expected cumulative Δ  |
| ------ | ---------------------------------------------------- | ------------------------------------ | ---------------------- |
| **T0** | Prerequisites (setx + CLAUDE.md secrets rule)        | No                                   | n/a                    |
| **T1** | Instrumentation foundation                           | Yes — new baseline with full metrics | 0s direct              |
| **T2** | Parallelize gates                                    | Yes                                  | −150 to −200s          |
| **T3** | Exercise F + trim tool surface                       | Yes                                  | −50 to −90s additional |
| **T4** | Inline role + standards in prompt                    | Yes                                  | −30 to −50s additional |
| **T5** | Skip gitnexus re-index when fresh                    | Yes                                  | −5 to −15s additional  |
| **T6** | Container reuse with configurable pool               | Yes (with `--warm-pool=2`)           | −25 to −35s additional |
| **T7** | Prompt caching audit                                 | No (investigation)                   | 0s direct              |
| **T8** | Summary report + ≥40% target check + Phase 5 framing | n/a                                  | cumulative table       |

**Cumulative target**: 907s → ~450–550s/task (~45–55% from baseline).

## Measurement strategy

Every measured task (T2–T6) ends by running the three-helpers plan on `node-ts-toy` and appending a row to a Results table in the plan's `plan.md`.

- **Canonical comparison**: median of T4 + T5 (run in parallel, N=2). T6 reported separately as the harder-task control.
- **Per-task budget rule**: if `total_ms` for the measured task fails to drop by at least the lower-bound estimate, treat as a regression flag — investigate root cause before moving to the next task.
- **Results table format**:

| Step                    | total_ms | worker_install_ms | worker_cli_ms | worker_gates_ms | gates_parallel_ms | cli_tool_calls | cli_input_tokens | cli_cache_read% | host_container_reuse | host_gitnexus_skipped |
| ----------------------- | -------- | ----------------- | ------------- | --------------- | ----------------- | -------------- | ---------------- | --------------- | -------------------- | --------------------- |
| Baseline (post-Phase 3) | 907,550  | 53,808            | 591,131       | 249,724         | n/a               | 0 (broken)     | n/a              | n/a             | 0                    | 0                     |
| + T1 instrumentation    | …        | …                 | …             | …               | …                 | TBD            | TBD              | TBD             | 0                    | 0                     |
| + T2 parallel gates     | …        | …                 | …             | …               | …                 | …              | …                | …               | 0                    | 0                     |
| + T3 F + tool trim      | …        | …                 | …             | …               | …                 | …              | …                | …               | 0                    | 0                     |
| + T4 inline content     | …        | …                 | …             | …               | …                 | …              | …                | …               | 0                    | 0                     |
| + T5 gitnexus skip      | …        | …                 | …             | …               | …                 | …              | …                | …               | 0                    | 1                     |
| + T6 container pool     | …        | …                 | …             | …               | …                 | …              | …                | …               | 1                    | 1                     |

## Risks & mitigations

| Risk                                                                                        | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallel gates lose fail-fast; broken builds run all gates instead of stopping at the first | Acceptable trade-off (we measure wall time, not CPU). Provide `gates.parallel: false` escape hatch in `.arandano/config.yaml`.                                         |
| Container reuse leaks workspace state across tasks                                          | Reset script must end with `git status --porcelain` returning empty. If not empty, destroy the container and fall back to a fresh one. Telemetry tracks reuse vs miss. |
| Inlined prompt content blows past Claude context limits                                     | Cap inlined content at 8KB total; truncate gracefully with a `[truncated, see <path> for full]` tail and keep the original "Read these files" fallback instruction.    |
| Prompt caching audit (T7) finds CLI doesn't set `cache_control`                             | Stop and document the finding. Do NOT pursue direct-API rewrite in this spec — that's a Phase 5+ scope.                                                                |
| `--disallowed-tools` flag absent in deployed Claude Code version                            | Verify with `claude --help` in a dry run before T3b. If absent, drop T3b and note it as deferred in the plan.                                                          |
| Container reuse + parallel tasks → pool exhaustion deadlock                                 | Pool acquire has a 60s timeout that falls back to a fresh container. `warm_pool_size` should typically equal max parallel task count.                                  |
| Claude reads/echoes secrets despite CLAUDE.md rule                                          | Rule is procedural, not enforced. Mitigate by limiting Claude's reasons to ever touch those env vars (no debug commands that print env in any task).                   |
| gitnexus mtime skip causes stale index on file changes that don't bump mtime (rare)         | Bench column `host_gitnexus_skipped` makes skips visible. If a task fails unexpectedly with stale-symbol errors, force re-index by `touch .gitnexus/.refresh`.         |

## Success criteria

- [ ] T0 prerequisites complete; Claude can run `arandano run --plan ...` without user intervention.
- [ ] T1 instrumentation: `cli_tool_calls` > 0 in bench.csv on every successful task; token columns present.
- [ ] Each of T2–T6 has a Results table row with its measured delta.
- [ ] **Cumulative per-task wall time ≤ 550s** (≥45% from 1,006s baseline). Stretch: ≤ 450s (~55%).
- [ ] If the target isn't met, T8 summary explicitly lists which improvement under-delivered and proposes a Phase 5 followup.
- [ ] All existing tests pass; no correctness regressions.
- [ ] `gates.parallel: false` and `executor.warm_pool_size: 0` reproduce pre-Phase 4 behavior exactly (escape hatches verified).
- [ ] T7 audit produces a written finding documented in `plan.md`.
