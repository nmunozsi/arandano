> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/phase.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md                                                          ← you are here
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

# arandano Phase 2 — DAG Batching, Reviewer Task, Python + Go Stacks Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — task surfaces and a new Task 0 (e2e prologue) have been added.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move from one-task-at-a-time to batched DAG execution. Implement parallel dispatch with `max_parallel`, the reviewer task that auto-spawns after each coder task, two new stacks (Python and Go) with full quality configs, and the management subcommands (`status`, `retry`, `cleanup`, `doctor`, `memory`, `issue`). After this phase, a real plan with multiple tasks runs end-to-end with reviewer feedback loops, and `arandano init --stack=python` / `--stack=go` are first-class.

**Architecture:** A new `Batch` type in `@arandano/core` represents a set of ready tasks. The `Orchestrator` class loads all task MDs in a plan folder, builds a DAG, and pulls batches off it as dependencies clear. Reviewer tasks are synthetic — created in-memory when a coder task completes, sharing the same execution path. New `@arandano/templates/stacks/python/` and `stacks/go/` ship parallel toolchains. Management subcommands read `.arandano/state.json` and Git/Docker state.

**Tech Stack:** Adds `graphlib` (or a hand-rolled topo sort), and inside the Python and Go stacks: `ruff`, `mypy`, `pytest`, `coverage.py`, `pip-audit`, `gofmt`, `golangci-lint`, `go test`, `govulncheck`.

**Reference spec:** `arandano-design.md` §6, §10, §15.3, §16, §24 Phase 2.

**Scope deferrals (deliberate, picked up later):**

- Multi-provider CLI selection (OpenCode, Gemini, Codex) — Phase 3.
- Coverage delta vs base + security as `required` — Phase 3.
- Remote Docker over SSH — Phase 4.

---

## Phase 1 reality check (2026-05-11)

Phase 1 has shipped. Before executing this plan, lock these surfaces in — do **not** redefine or rename them.

**Locked-in Phase 1 surfaces:**

- `Executor` interface — `packages/core/src/types/executor.ts:38-43`:
  ```ts
  export interface Executor {
    start(task: TaskRun): Promise<Handle>;
    wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult>;
    logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string>;
    cancel(h: Handle): Promise<void>;
  }
  ```
- `StateStore.update` — `packages/core/src/state/store.ts:22` — **takes a callback, not a patch object**:
  ```ts
  async update(updater: (state: RunState) => void | Promise<void>): Promise<RunState>
  ```
- `RunState` — `packages/core/src/types/state.ts:13` — `{ tasks: Record<string, TaskState> }`. **Import from `'../types/state.js'`, not from `'../state/store.js'`** (Task 1 below has the wrong import path).
- `runOne` — `packages/core/src/orchestrator/runOne.ts` — `runOne({ projectRoot, taskId, executor }): Promise<ExitResult>`.
- Env vars set by `containerSpec.ts`: `ARANDANO_TASK_ID`, `ARANDANO_TASK_MD`, `ARANDANO_ROLE_MD`, `ARANDANO_CLI`, `ARANDANO_MODEL`, `ARANDANO_TDD`, `ARANDANO_RUN_FOLDER`, `ARANDANO_QUALITY_JSON`, `ARANDANO_CONTEXT_PATHS` + any in `task.envPass`.
- Run folder format: `YYYY-MM-DDTHH-MMZ-<taskId>` (UTC).
- 5 existing packages: `core`, `cli`, `executors-docker`, `templates`, `skills`.
- Template `.tpl` convention: any file requiring `{{name}}`, `{{license}}`, `{{worker_image}}`, or `{{contact_email}}` interpolation **must** end in `.tpl`. The scaffold writer at `packages/templates/src/scaffold.ts` strips the suffix.
- CLI exit-code idiom: `if (result.exitCode !== 0) process.exit(result.exitCode);` — **not** `this.exit(code)`. oclif 4's `exit()` takes no args.
- Worker driver lives at `arandano-worker/lib/src/driver.ts`; gates at `arandano-worker/lib/src/gates/`; entrypoint exported as `main` from `arandano-worker/lib/src/index.ts`.

**Phase 1 deferrals this plan must close before its own work begins** — see Task 0.

**Per-task corrections to apply while executing the tasks below:**

- **Task 1** (dag.ts): the import `import type { RunState } from '../state/store.js';` is wrong. Use `import type { RunState } from '../types/state.js';`. `RunState` is exported from the types module, not from `store.ts`. The `state/store.ts` file does **not** export `RunState`.
- **Task 1** (dag.ts test): `selectReadyBatch`'s state argument uses `TaskState` shape. Phase 1's `TaskState` requires `retry_count: number` (see `packages/core/src/types/state.ts:7`); the test seeds `{ status: 'in_progress' }` without it. Either widen the type or add `retry_count: 0` to each seeded entry.
- **Task 2** (loadPlan): the regex `^T\d+-.*\.md$` is fine but mirror Phase 1's `findTaskMd` glob (`${id}-*.md`) for naming consistency; both are compatible with the existing `node-ts-toy/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md`.
- **Task 3** (orchestrator): in code blocks that call `state.tasks[taskId].status = '...'`, route writes through `store.update((state) => { ... })` rather than mutating after `store.read()`. The test executors `async () => ({...})` will trigger Phase 1's `require-await` lint rule; switch to `() => Promise.resolve({...})`.
- **Task 3** (orchestrator.ts): the `isSettled` helper at the bottom races a resolved sentinel against the actual promise — this can busy-loop on Node 22. Replace with a `Set<Promise<{ id: string }>>` pattern: each in-flight task resolves to its own `id` and removes itself from the set on settle. Reference DockerExecutor's `Map<string, ...>` running-set pattern.
- **Task 4** (synthesizeReviewerTask): the `quality` field on `TaskFrontmatter` is typed as `unknown`/parsed via Zod in Phase 1 (`packages/core/src/types/task.ts`). The `as never` casts are unnecessary; use the actual type or update `task.ts`'s Zod schema to include `reviewer_required`.
- **Task 5** (reviewerDriver.ts): mirror the env-var-required helper from Phase 1's `arandano-worker/lib/src/driver.ts`:
  ```ts
  const env = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env: ${k}`);
    return v;
  };
  ```
  rather than `process.env.X!` non-null assertions.
- **Task 6** (`arandano run --plan`): Phase 1's `run.ts` always news up `DockerExecutor`. Refactor to share a `pickExecutor(cfg)` helper between `run` (single-task) and the new plan dispatcher; both will need it once Phase 5 (k8s) lands. Use `process.exit(code)` for non-zero exits.
- **Task 7–9** (status/retry/cleanup/doctor/memory/issue commands): every new command must follow Phase 1's idiom — `process.exit(code)`, not `this.exit(code)`.
- **Task 10 + 11** (Python + Go stacks): every file with `{{...}}` tokens must end in `.tpl`. Specifically: `AGENTS.md.tpl`, `README.md.tpl`, `.gitignore.tpl` (because it references `{{name}}`), `.arandano/config.yaml.tpl`, `planning/memory/coding-standards.md.tpl`, **and any nested-config file that local tooling auto-discovers** (Phase 1 hit this with `.lintstagedrc.json.tpl`). Mirror the node-ts approach: any file whose presence in the monorepo would interfere with root-level tooling gets `.tpl`'d.
- **Task 10 + 11** (Python + Go stacks): the root ESLint config already ignores `packages/templates/stacks/**` — no changes needed there, but verify before assuming.
- **Task 12** (e2e): node-ts e2e is Task 0 below. This task adds python-cli-toy and go-toy e2e runs on top.

---

## Tasks

- [ ] [T0 — Close Phase 1's deferred e2e gap (prerequisite)](T0-close-phase-1-s-deferred-e2e-gap.md)
- [ ] [T1 — DAG construction and ready-batch selection (TDD)](T1-dag-construction-and-ready-batch-selection.md)
- [ ] [T2 — Plan loader (TDD)](T2-plan-loader.md)
- [ ] [T3 — Orchestrator class — drives a plan to completion (TDD)](T3-orchestrator-class-drives-a-plan-to-completion.md)
- [ ] [T4 — Synthetic reviewer task generator (TDD)](T4-synthetic-reviewer-task-generator.md)
- [ ] [T5 — Reviewer driver inside the worker](T5-reviewer-driver-inside-the-worker.md)
- [ ] [T6 — `arandano run --plan=<slug>` accepts a whole plan](T6-arandano-run-plan-slug-accepts-a-whole-plan.md)
- [ ] [T7 — `arandano status` command](T7-arandano-status-command.md)
- [ ] [T8 — `arandano retry`, `arandano cleanup`, `arandano doctor`](T8-arandano-retry-arandano-cleanup-arandano-doctor.md)
- [ ] [T9 — `arandano memory promote` and `arandano issue` commands](T9-arandano-memory-promote-and-arandano-issue-command.md)
- [ ] [T10 — Python stack scaffold + worker preflight](T10-python-stack-scaffold-worker-preflight.md)
- [ ] [T11 — Go stack scaffold + worker preflight](T11-go-stack-scaffold-worker-preflight.md)
- [ ] [T12 — End-to-end batched run on the node-ts toy](T12-end-to-end-batched-run-on-the-node-ts-toy.md)

---

## Exit criteria

## Phase 2 done — exit criteria

- [x] **Task 0 closed: Phase 1 e2e proven** — node-ts-toy has agent-authored PRs; `DockerExecutor.integration.test.ts` passes with `VITEST_DOCKER_INTEGRATION=1`; worker image pulls cleanly
- [x] `arandano run --plan=<slug>` runs an entire DAG with `max_parallel` parallelism — T4+T5 parallel, T6 gated on both; PRs #2/#3/#4 opened
- [x] Reviewer tasks auto-spawn after coder tasks when `reviewer_required: true`; secrets in diffs trigger `request_changes` (T4/T5/T6 used `reviewer_required: false`)
- [x] `arandano init --stack=python` and `--stack=go` produce buildable scaffolds (`.tpl` suffix on every token-bearing file)
- [x] Worker runs the right gate set for the project's stack (Node-TS, Python, or Go)
- [x] `arandano status`, `retry`, `cleanup`, `doctor`, `memory promote`, and `issue {open,close,list}` work end-to-end (all using `process.exit(code)` idiom)
- [ ] Three example projects (node-ts-toy, python-cli-toy, go-toy) each have at least one fully agent-authored PR — **node-ts-toy ✅, python-cli-toy and go-toy deferred to Phase 3** (need Docker e2e runs)

After this, the next plan covers **Phase 3 — multi-provider CLI selection (OpenCode, Gemini, Codex), coverage delta vs. base branch, and security as a required gate**.
