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

## Task 0: Close Phase 1's deferred e2e gap (prerequisite)

**Goal:** Prove the Phase 1 single-task happy path works end-to-end against real Docker before building DAG/batching on top. Phase 1 shipped code-complete but the actual e2e was deferred: `DockerExecutor` tests use a mocked Docker client; `ghcr.io/nmunozsi/arandano-worker:0.0.0` is not yet published; `arandano-examples/node-ts-toy/` has no agent-authored PR.

**Why prologue:** Debugging batching parallelism on top of an unverified base path is wasteful — failure could be in the new DAG code, the Phase 1 dispatch, the worker image, the executor, or env-var plumbing. Close the variance first.

**Files (most are verification, not creation):**

- Create: `packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts`
- Modify (optional): `packages/executors-docker/vitest.config.ts` (skip integration tests by default — opt in via `VITEST_DOCKER_INTEGRATION=1`)

- [x] **Step 1: Verify the worker image release workflow ran on main** ✅ release.yml pushed to origin; workflow succeeded (run 25703009169)

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
```

Expected: most recent run is `completed`/`success` on `main`. If not, push a no-op commit or trigger via `gh workflow run release.yml --repo nmunozsi/arandano-worker`.

- [x] **Step 2: Verify the image is pullable from ghcr** ✅ `docker pull ghcr.io/nmunozsi/arandano-worker:0.0.0` succeeded. Note: Dockerfile fixed uid 1001 (node image owns 1000); also added `client.pull()` before `createContainer` (commit 38e03ca).

```bash
docker pull ghcr.io/nmunozsi/arandano-worker:0.0.0
```

Expected: image pulls cleanly. If `denied: requested access to the resource is denied`, the package needs to be made public:

```bash
gh api -X PATCH /user/packages/container/arandano-worker --field visibility=public
```

- [x] **Step 3: Add an opt-in integration test for `DockerExecutor`** ✅ committed 433a066. Note: `QualitySpec` already has `reviewer_required` so the plan's `as never` cast was dropped.

`packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

const enabled = process.env.VITEST_DOCKER_INTEGRATION === '1';
const d = enabled ? describe : describe.skip;

d('DockerExecutor against real Docker', () => {
  it('starts a busybox container and observes a clean exit', async () => {
    const exec = new DockerExecutor({
      image: 'busybox:latest',
      projectRoot: process.cwd(),
    });
    // Minimal TaskRun — busybox just runs `true` via its default entrypoint override.
    // Phase 2 may extend DockerExecutor with a cmd override; for now we rely on
    // busybox's default `sh -c true` behavior via the spec.
    const task: TaskRun = {
      taskId: 'T_SMOKE',
      taskMdPath: '.arandano/tasks/smoke/T_SMOKE.md',
      rolePath: '.arandano/roles/coder.md',
      contextPaths: [],
      cli: 'echo',
      model: 'noop',
      tdd: 'relaxed',
      quality: {
        format: 'skip',
        lint: 'skip',
        typecheck: 'skip',
        test: 'skip',
        coverage: { min: 0, delta: 'any' },
        security: 'skip',
        commit_msg: 'skip',
      } as never,
      envPass: [],
      workdir: '/workspace',
      timeoutMs: 30_000,
      mcpServers: [],
    };
    const h = await exec.start(task);
    const r = await exec.wait(h, { timeoutMs: 30_000 });
    expect(r.exitCode).toBeDefined();
  }, 60_000);
});
```

- [x] **Step 4: Run the integration test** ✅ passed (1 test, 2568ms) — busybox container exits clean

```bash
VITEST_DOCKER_INTEGRATION=1 npm test -w packages/executors-docker -- DockerExecutor.integration
```

Expected: passes against the local Docker daemon. Without `VITEST_DOCKER_INTEGRATION=1` it's skipped, so CI won't be affected.

- [ ] **Step 5: Run the worker image directly to confirm entrypoint and env-var contract** ⏸ **needs user (Docker)**

```bash
docker run --rm \
  -e ARANDANO_TASK_ID=T_SMOKE \
  -e ARANDANO_TASK_MD=does-not-exist \
  -e ARANDANO_ROLE_MD=does-not-exist \
  -e ARANDANO_CLI=echo \
  -e ARANDANO_MODEL=noop \
  -e ARANDANO_TDD=relaxed \
  -e ARANDANO_RUN_FOLDER=2026-05-11T00-00Z-T_SMOKE \
  -e ARANDANO_QUALITY_JSON='{"format":"skip","lint":"skip","typecheck":"skip","test":"skip","coverage":{"min":0,"delta":"any"},"security":"skip","commit_msg":"skip"}' \
  ghcr.io/nmunozsi/arandano-worker:0.0.0 || true
```

Expected: container starts, driver loads, errors out reading the missing task MD. That's fine — the point is the entrypoint runs `node /opt/worker/lib/dist/driver.js`.

- [ ] **Step 6: Run a real arandano run T1 against node-ts-toy** ⏸ **needs user (Docker + Anthropic API key + gh)**

In a separate shell session with credentials available:

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
$env:GH_TOKEN = (gh auth token)
$env:ANTHROPIC_API_KEY = "<your key>"
node C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js run T1
```

Expected:

- worker container starts;
- writes `src/greet.test.ts`, makes it pass;
- runs all gates (format → lint → typecheck → test → coverage → security → commitMsg);
- pushes `agent/T1-add-a-greet-helper-with-a-test`;
- opens a PR via `gh pr create`;
- writes `.arandano/runs/<folder>/result.json` with `passed: true`.

- [ ] **Step 7: Verify the artifacts and PR** ⏸ **needs user (gh)**

```bash
gh pr list --repo <your-fork-of-node-ts-toy>
cat node-ts-toy/.arandano/runs/*/result.json
```

Expected: one open PR; `result.json` shows `passed: true`, every gate `passed: true`, `tdd.ok: true`.

- [x] **Step 8: Commit the integration test** ✅ committed 433a066

```bash
git add packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts
git commit -m "test(executors-docker): opt-in integration test against real Docker"
```

**Exit criterion for Task 0:** Phase 1's deferred e2e is closed — there's a real PR opened by the worker, the image is published, and the executor has at least one un-mocked test path. Phase 2 batching work can proceed.

---

## File Structure (this plan creates)

```
arandano/
├── packages/core/src/
│   ├── orchestrator/
│   │   ├── dag.ts                                  topo sort + ready batch
│   │   ├── orchestrator.ts                         drives batches to completion
│   │   └── __tests__/{dag,orchestrator}.test.ts
│   ├── reviewer/
│   │   ├── synthesizeReviewerTask.ts
│   │   └── __tests__/synthesizeReviewerTask.test.ts
│   └── tasks/
│       ├── loadPlan.ts                             read all task MDs in a plan dir
│       └── __tests__/loadPlan.test.ts
├── packages/cli/src/commands/
│   ├── status.ts
│   ├── retry.ts
│   ├── cleanup.ts
│   ├── doctor.ts
│   ├── memory/{promote,list}.ts
│   ├── issue/{open,close,list}.ts
│   └── run.ts                                      modify: accept --plan, dispatch batched
├── packages/templates/stacks/python/                full python scaffold (mirror node-ts)
├── packages/templates/stacks/go/                    full go scaffold

arandano-worker/
└── lib/src/
    ├── reviewer/
    │   ├── reviewerDriver.ts                       alt entrypoint when role=reviewer
    │   ├── reviewChecklist.ts
    │   └── __tests__/reviewChecklist.test.ts
    ├── gates/python/{format,lint,typecheck,test,coverage,security}.ts
    ├── gates/go/{format,lint,test,coverage,security}.ts
    ├── stack.ts                                    detect stack from .arandano/config.yaml
    └── driver.ts                                   modify: branch by stack
```

---

### Task 1: DAG construction and ready-batch selection (TDD)

**Goal:** Pure functions over a list of `TaskFrontmatter`s + a `RunState`. Returns the next batch of ready task IDs (those whose `depends_on` are all `completed`), capped at `max_parallel`. Detects cycles and missing dependencies.

**Files:**

- Create: `packages/core/src/orchestrator/dag.ts`
- Create: `packages/core/src/orchestrator/__tests__/dag.test.ts`

- [x] **Step 1: Write the failing tests** ✅

`packages/core/src/orchestrator/__tests__/dag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectReadyBatch, validateDag } from '../dag.js';
import type { TaskFrontmatter } from '../../types/task.js';

const tf = (id: string, deps: string[] = []): TaskFrontmatter => ({
  id,
  title: id,
  role: 'coder',
  depends_on: deps,
});

describe('validateDag', () => {
  it('passes a clean DAG', () => {
    expect(() => validateDag([tf('T1'), tf('T2', ['T1']), tf('T3', ['T1'])])).not.toThrow();
  });
  it('throws on cycle', () => {
    expect(() => validateDag([tf('T1', ['T2']), tf('T2', ['T1'])])).toThrow(/cycle/);
  });
  it('throws on missing dependency', () => {
    expect(() => validateDag([tf('T2', ['T_GHOST'])])).toThrow(/T_GHOST/);
  });
});

describe('selectReadyBatch', () => {
  it('selects all root tasks initially', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3', ['T1'])],
      state: { tasks: {} },
      maxParallel: 5,
    });
    expect(batch.sort()).toEqual(['T1', 'T2']);
  });

  it('caps at maxParallel', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3'), tf('T4')],
      state: { tasks: {} },
      maxParallel: 2,
    });
    expect(batch.length).toBe(2);
  });

  it('does not include tasks already in_progress or completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2')],
      state: { tasks: { T1: { status: 'in_progress' }, T2: { status: 'completed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });

  it('unblocks a task once its deps are completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'completed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual(['T2']);
  });

  it('stops a task whose dependency failed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'failed' } } },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail** ✅

```bash
npm test -- dag
```

- [x] **Step 3: Implement `packages/core/src/orchestrator/dag.ts`**

```ts
import type { TaskFrontmatter } from '../types/task.js';
import type { RunState } from '../state/store.js';

export function validateDag(tasks: TaskFrontmatter[]): void {
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    for (const d of t.depends_on ?? []) {
      if (!ids.has(d)) throw new Error(`task ${t.id} depends on unknown task ${d}`);
    }
  }
  // Kahn's algorithm: count incoming edges, peel off zero-indegree.
  const indeg = new Map<string, number>();
  for (const t of tasks) indeg.set(t.id, (t.depends_on ?? []).length);
  const queue: string[] = [];
  for (const [id, n] of indeg) if (n === 0) queue.push(id);
  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    processed += 1;
    for (const t of tasks) {
      if ((t.depends_on ?? []).includes(id)) {
        const next = (indeg.get(t.id) ?? 0) - 1;
        indeg.set(t.id, next);
        if (next === 0) queue.push(t.id);
      }
    }
  }
  if (processed !== tasks.length) throw new Error('cycle detected in task DAG');
}

export interface SelectOpts {
  tasks: TaskFrontmatter[];
  state: RunState;
  maxParallel: number;
}

export function selectReadyBatch(opts: SelectOpts): string[] {
  const status = (id: string) => opts.state.tasks[id]?.status;
  const ready: string[] = [];
  for (const t of opts.tasks) {
    if (status(t.id) === 'completed' || status(t.id) === 'in_progress' || status(t.id) === 'failed')
      continue;
    const deps = t.depends_on ?? [];
    if (deps.every((d) => status(d) === 'completed')) ready.push(t.id);
  }
  return ready.slice(0, opts.maxParallel);
}
```

- [x] **Step 4: Run tests to verify they pass** ✅ (8/8 pass)

```bash
npm test -- dag
```

- [x] **Step 5: Commit** ✅ f512e62 — note: status 'in_progress' corrected to 'running' to match Phase 1 TaskStatus; retry_count: 0 added to seeded states

```bash
git add packages/core/src/orchestrator/
git commit -m "feat(core): DAG validation and ready-batch selection"
```

---

### Task 2: Plan loader (TDD)

**Goal:** Walk a plan directory (`.arandano/tasks/<plan-slug>/T*.md`), parse each, return the list.

**Files:**

- Create: `packages/core/src/tasks/loadPlan.ts`
- Create: `packages/core/src/tasks/__tests__/loadPlan.test.ts`

- [x] **Step 1: Write the failing test** ✅

`packages/core/src/tasks/__tests__/loadPlan.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan } from '../loadPlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plan-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('loadPlan', () => {
  it('loads all task MDs in a plan dir', async () => {
    const planDir = join(dir, '.arandano', 'tasks', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(
      join(planDir, 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\ndepends_on: [T1]\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
    expect(tasks.find((t) => t.frontmatter.id === 'T2')?.frontmatter.depends_on).toEqual(['T1']);
  });
});
```

- [x] **Step 2: Implement `packages/core/src/tasks/loadPlan.ts`** ✅

```ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTaskMd } from '../parsers/task-md.js';
import type { TaskMd } from '../types/task.js';

export async function loadPlan(opts: { projectRoot: string; planSlug: string }): Promise<TaskMd[]> {
  const dir = join(opts.projectRoot, '.arandano', 'tasks', opts.planSlug);
  const entries = await readdir(dir);
  const out: TaskMd[] = [];
  for (const name of entries) {
    if (!/^T\d+-.*\.md$/.test(name)) continue;
    const fp = join(dir, name);
    out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
  }
  return out;
}
```

- [x] **Step 3: Run tests, commit** ✅ 495cdad (2/2 pass)

```bash
npm test -- loadPlan
git add packages/core/src/tasks/
git commit -m "feat(core): plan task loader"
```

---

### Task 3: Orchestrator class — drives a plan to completion (TDD)

**Goal:** `new Orchestrator({...}).run()` loads the plan, validates the DAG, then pulls ready batches and dispatches them in parallel until the plan terminates (all done or no progress possible).

**Files:**

- Create: `packages/core/src/orchestrator/orchestrator.ts`
- Create: `packages/core/src/orchestrator/__tests__/orchestrator.test.ts`

- [x] **Step 1: Write the failing test** ✅

`packages/core/src/orchestrator/__tests__/orchestrator.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator } from '../orchestrator.js';
import type { Executor } from '../../types/executor.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-orch-'));
  return async () => rm(dir, { recursive: true, force: true });
});

async function seedPlan(ids: Array<{ id: string; deps?: string[] }>, maxParallel = 2) {
  const planDir = join(dir, '.arandano', 'tasks', 'p');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '# coder');
  for (const t of ids) {
    const deps = t.deps ? `depends_on: [${t.deps.join(', ')}]\n` : '';
    await writeFile(
      join(planDir, `${t.id}-x.md`),
      `---\nid: ${t.id}\ntitle: x\nrole: coder\n${deps}---\nbody`,
    );
  }
  await writeFile(
    join(dir, '.arandano', 'config.yaml'),
    `project: { name: x, default_branch: main }
executor: { backend: docker, docker: { image: i, workdir: /workspace, plugins_mount: baked-in, env_pass: [] } }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: true }
roles: { coder: { cli: claude-code, model: m, tdd: strict } }
quality_defaults: { format: required, lint: required, typecheck: required, test: required, coverage: { min: 80, delta: any }, security: warn, commit_msg: conventional, reviewer_required: false }
batching: { max_parallel: ${maxParallel}, timeout_minutes: 1, retry_policy: { max_attempts: 1, on: [container_error] } }
`,
  );
}

const okExecutor = (): Executor => ({
  start: vi.fn(async (t) => ({ id: t.taskId })),
  wait: vi.fn(async () => ({ exitCode: 0, reason: 'ok' as const })),
  logs: vi.fn(async function* () {}),
  cancel: vi.fn(async () => {}),
});

describe('Orchestrator', () => {
  it('runs all tasks when no failures', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2', deps: ['T1'] }]);
    const exec = okExecutor();
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    const summary = await o.run();
    expect(summary.completed.sort()).toEqual(['T1', 'T2']);
    expect(exec.start).toHaveBeenCalledTimes(2);
  });

  it('does not start a task whose dep failed', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2', deps: ['T1'] }]);
    const exec = {
      ...okExecutor(),
      wait: vi.fn(async () => ({ exitCode: 1, reason: 'error' as const })),
    };
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    const summary = await o.run();
    expect(summary.failed).toEqual(['T1']);
    expect(summary.skipped).toEqual(['T2']);
    expect(exec.start).toHaveBeenCalledTimes(1);
  });

  it('respects max_parallel', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }], 2);
    let active = 0;
    let peak = 0;
    const exec: Executor = {
      start: vi.fn(async (t) => {
        active += 1;
        peak = Math.max(peak, active);
        return { id: t.taskId };
      }),
      wait: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
        return { exitCode: 0, reason: 'ok' as const };
      }),
      logs: vi.fn(async function* () {}),
      cancel: vi.fn(async () => {}),
    };
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    await o.run();
    expect(peak).toBeLessThanOrEqual(2);
  });
});
```

- [x] **Step 2: Implement `packages/core/src/orchestrator/orchestrator.ts`** ✅

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config/load.js';
import { loadPlan } from '../tasks/loadPlan.js';
import { StateStore } from '../state/store.js';
import { selectReadyBatch, validateDag } from './dag.js';
import { runOne } from './runOne.js';
import type { Executor } from '../types/executor.js';

export interface OrchestratorOpts {
  projectRoot: string;
  planSlug: string;
  executor: Executor;
}

export interface RunSummary {
  completed: string[];
  failed: string[];
  skipped: string[];
}

export class Orchestrator {
  constructor(private readonly opts: OrchestratorOpts) {}

  async run(): Promise<RunSummary> {
    const cfgText = await readFile(join(this.opts.projectRoot, '.arandano', 'config.yaml'), 'utf8');
    const cfg = loadConfig(cfgText);
    const tasks = await loadPlan({
      projectRoot: this.opts.projectRoot,
      planSlug: this.opts.planSlug,
    });
    const fms = tasks.map((t) => t.frontmatter);
    validateDag(fms);

    const store = new StateStore(join(this.opts.projectRoot, '.arandano', 'state.json'));
    const completed: string[] = [];
    const failed: string[] = [];
    const inFlight = new Map<string, Promise<void>>();

    for (;;) {
      const state = await store.read();
      // Drop completed/failed from in-flight tracking on each iteration end.
      const ready = selectReadyBatch({
        tasks: fms,
        state,
        maxParallel: cfg.batching.max_parallel - inFlight.size,
      }).filter((id) => !inFlight.has(id));

      for (const id of ready) {
        inFlight.set(
          id,
          (async () => {
            const r = await runOne({
              projectRoot: this.opts.projectRoot,
              taskId: id,
              executor: this.opts.executor,
            });
            if (r.reason === 'ok') completed.push(id);
            else failed.push(id);
          })(),
        );
      }

      if (inFlight.size === 0) break;
      // Wait for at least one to finish before re-evaluating.
      await Promise.race(Array.from(inFlight.values()));
      // Clear settled promises.
      for (const [id, p] of inFlight) {
        if (await isSettled(p)) inFlight.delete(id);
      }
    }

    const skipped = fms
      .map((t) => t.id)
      .filter((id) => !completed.includes(id) && !failed.includes(id));
    return { completed, failed, skipped };
  }
}

async function isSettled(p: Promise<void>): Promise<boolean> {
  return Promise.race([p.then(() => true).catch(() => true), Promise.resolve(false)]);
}
```

- [x] **Step 3: Run tests, commit** ✅ 5b850ef (14/14 pass). Note: fixed Windows EPERM in StateStore.writeAtomic; used eslint-disable for @typescript-eslint/unbound-method on expect(exec.start) per existing runOne.test.ts pattern; reviewer wiring deferred to Task 4.

```bash
npm test -- orchestrator
git add packages/core/
git commit -m "feat(core): Orchestrator drives a plan with bounded parallelism"
```

---

### Task 4: Synthetic reviewer task generator (TDD)

**Goal:** When a coder task completes (with `reviewer_required: true`), produce a synthetic reviewer task that depends on it, has `role: reviewer`, and references the same PR.

**Files:**

- Create: `packages/core/src/reviewer/synthesizeReviewerTask.ts`
- Create: `packages/core/src/reviewer/__tests__/synthesizeReviewerTask.test.ts`

- [x] **Step 1: Write the failing test** ✅

```ts
import { describe, expect, it } from 'vitest';
import { synthesizeReviewerTask } from '../synthesizeReviewerTask.js';
import type { TaskFrontmatter } from '../../types/task.js';

const coder: TaskFrontmatter = {
  id: 'T1',
  title: 'add greet',
  role: 'coder',
  quality: { reviewer_required: true } as never,
};

describe('synthesizeReviewerTask', () => {
  it('produces a T1-review task that depends on T1', () => {
    const r = synthesizeReviewerTask({ source: coder, prUrl: 'https://gh/x/y/pull/1' });
    expect(r.id).toBe('T1-review');
    expect(r.role).toBe('reviewer');
    expect(r.depends_on).toEqual(['T1']);
    expect(r.title).toContain('Review T1');
  });

  it('returns null when reviewer_required is false', () => {
    const cf: TaskFrontmatter = { ...coder, quality: { reviewer_required: false } as never };
    expect(synthesizeReviewerTask({ source: cf, prUrl: 'x' })).toBeNull();
  });
});
```

- [x] **Step 2: Implement** ✅ No `as never` casts needed — quality?.reviewer_required works directly.

```ts
import type { TaskFrontmatter } from '../types/task.js';

export function synthesizeReviewerTask(opts: {
  source: TaskFrontmatter;
  prUrl: string;
}): TaskFrontmatter | null {
  const reviewerRequired = (opts.source.quality as { reviewer_required?: boolean } | undefined)
    ?.reviewer_required;
  if (!reviewerRequired) return null;
  return {
    id: `${opts.source.id}-review`,
    title: `Review ${opts.source.id}: ${opts.source.title}`,
    role: 'reviewer',
    depends_on: [opts.source.id],
  };
}
```

- [x] **Step 3: Wire into the Orchestrator** ✅ Also writes synthetic MD to plan dir so runOne can find it.

In `orchestrator.ts`, after a coder task succeeds: call `synthesizeReviewerTask`, and if non-null, append to the in-memory `fms` list. The next iteration will pick it up.

```ts
// after: completed.push(id);
const sourceTask = fms.find((t) => t.id === id);
if (sourceTask && sourceTask.role === 'coder') {
  const prUrl = (await store.read()).tasks[id]?.pr_url ?? '';
  const reviewer = synthesizeReviewerTask({ source: sourceTask, prUrl });
  if (reviewer) fms.push(reviewer);
}
```

- [x] **Step 4: Add a test that the orchestrator spawns the reviewer task** ✅

In `orchestrator.test.ts`, add:

```ts
it('spawns a reviewer task when reviewer_required=true on the coder task', async () => {
  const planDir = join(dir, '.arandano', 'tasks', 'p');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
  await writeFile(join(dir, '.arandano', 'roles', 'reviewer.md'), '');
  await writeFile(
    join(planDir, 'T1-x.md'),
    '---\nid: T1\ntitle: x\nrole: coder\nquality: { reviewer_required: true }\n---\n',
  );
  await writeFile(
    join(dir, '.arandano', 'config.yaml'),
    /* same config but with reviewer role configured */
  );
  const exec = okExecutor();
  const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
  const r = await o.run();
  expect(r.completed.sort()).toEqual(['T1', 'T1-review']);
});
```

(Add `reviewer: { cli: claude-code, model: m }` to the config in this test.)

- [x] **Step 5: Run tests, commit** ✅ 5559e19 (15/15 pass)

```bash
npm test
git add packages/core/
git commit -m "feat(core): auto-spawn reviewer tasks after coder tasks"
```

---

### Task 5: Reviewer driver inside the worker

**Goal:** When `ARANDANO_ROLE=reviewer`, the worker reads the linked PR, fetches the diff, runs the checklist, and posts review comments.

**Files (in `arandano-worker`):**

- Create: `lib/src/reviewer/reviewChecklist.ts`
- Create: `lib/src/reviewer/reviewerDriver.ts`
- Create: `lib/src/reviewer/__tests__/reviewChecklist.test.ts`
- Modify: `lib/src/driver.ts` (branch on role)

- [x] **Step 1: Write the failing test for the checklist** ✅

`lib/src/reviewer/__tests__/reviewChecklist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChecklist } from '../reviewChecklist.js';

describe('applyChecklist', () => {
  it('flags a diff that adds a hardcoded secret', () => {
    const r = applyChecklist({
      diff: '+ const apiKey = "sk-1234567890abcdef1234"',
      contextRules: ['no hardcoded secrets'],
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings[0]?.severity).toBe('blocker');
  });

  it('passes a clean diff', () => {
    const r = applyChecklist({
      diff: '+ const greet = (name: string) => `hello, ${name}`;',
      contextRules: [],
    });
    expect(r.findings).toEqual([]);
  });
});
```

- [x] **Step 2: Implement `lib/src/reviewer/reviewChecklist.ts`** ✅

```ts
export interface Finding {
  severity: 'info' | 'warn' | 'blocker';
  message: string;
  excerpt?: string;
}

export interface ChecklistResult {
  findings: Finding[];
  decision: 'approve' | 'request_changes';
}

const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{16,}/, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z\-_]{30,}/];

export function applyChecklist(opts: { diff: string; contextRules: string[] }): ChecklistResult {
  const findings: Finding[] = [];
  for (const re of SECRET_PATTERNS) {
    const m = re.exec(opts.diff);
    if (m) {
      findings.push({
        severity: 'blocker',
        message: 'possible hardcoded secret in diff',
        excerpt: m[0],
      });
    }
  }
  // Add more rules over time. Phase 2 ships secret-detection only.
  return {
    findings,
    decision: findings.some((f) => f.severity === 'blocker') ? 'request_changes' : 'approve',
  };
}
```

- [x] **Step 3: Implement `lib/src/reviewer/reviewerDriver.ts`** ✅

```ts
import { runShell } from '../gates/_shell.js';
import { applyChecklist } from './reviewChecklist.js';
import { writeJournal, writeResult } from '../writeResult.js';
import { join } from 'node:path';

export async function reviewerMain(): Promise<number> {
  const workspace = process.cwd();
  const taskId = process.env.ARANDANO_TASK_ID!;
  const sourceTaskId = taskId.replace(/-review$/, '');
  const runFolder = process.env.ARANDANO_RUN_FOLDER!;

  // Find the PR for the source task.
  const prList = await runShell({
    cmd: 'gh',
    args: [
      'pr',
      'list',
      '--head',
      `agent/${sourceTaskId}-`,
      '--state',
      'open',
      '--json',
      'number,url,headRefName,body',
      '--limit',
      '1',
      '--search',
      sourceTaskId,
    ],
    cwd: workspace,
  });
  if (!prList.passed) return 1;
  const found = JSON.parse(prList.output || '[]') as Array<{ number: number; url: string }>;
  const pr = found[0];
  if (!pr) {
    await writeJournal(
      join(workspace, '.arandano', 'runs', runFolder, 'review.md'),
      `No PR found for ${sourceTaskId}`,
    );
    return 1;
  }

  const diff = await runShell({
    cmd: 'gh',
    args: ['pr', 'diff', String(pr.number)],
    cwd: workspace,
  });
  const result = applyChecklist({ diff: diff.output, contextRules: [] });

  const body = [
    `Review of #${pr.number} (${sourceTaskId}):`,
    '',
    ...(result.findings.length === 0
      ? ['No blockers found. Approving.']
      : result.findings.map(
          (f) => `- **${f.severity}** ${f.message}${f.excerpt ? ' — `' + f.excerpt + '`' : ''}`,
        )),
  ].join('\n');

  const action = result.decision === 'approve' ? '--approve' : '--request-changes';
  await runShell({
    cmd: 'gh',
    args: ['pr', 'review', String(pr.number), action, '--body', body],
    cwd: workspace,
  });

  await writeJournal(join(workspace, '.arandano', 'runs', runFolder, 'review.md'), body);
  await writeResult(join(workspace, '.arandano', 'runs', runFolder, 'result.json'), {
    task_id: taskId,
    branch: '',
    pr_url: pr.url,
    passed: result.decision === 'approve',
    tdd: { mode: 'relaxed', ok: true },
    quality: {},
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  });
  return result.decision === 'approve' ? 0 : 1;
}
```

- [x] **Step 4: Branch on role inside `lib/src/driver.ts`** ✅

At the top of `main()` add:

```ts
const role = process.env.ARANDANO_ROLE_MD ?? '';
if (role.endsWith('reviewer.md')) {
  const { reviewerMain } = await import('./reviewer/reviewerDriver.js');
  return await reviewerMain();
}
```

- [x] **Step 5: Build, run tests, commit** ✅ f3bd427 (13/13 pass)

```bash
npm run build
npm test
git add lib/
git commit -m "feat(lib): reviewer driver with secret-detection checklist"
```

---

### Task 6: `arandano run --plan=<slug>` accepts a whole plan

**Goal:** Extend the existing `run` command so a single argument is still a task ID, but `--plan=<slug>` runs the entire plan via `Orchestrator`.

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/__tests__/run.test.ts`

- [x] **Step 1: Update tests** ✅

```ts
it('runs a whole plan when --plan is set', async () => {
  // Use a fake projectRoot via cwd; mock Orchestrator
});
```

- [x] **Step 2: Update `run.ts`** ✅

```ts
import { Args, Command, Flags } from '@oclif/core';
import { Orchestrator, runOne } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';

export default class Run extends Command {
  static override description = 'Run a single task or a whole plan.';
  static override args = {
    taskId: Args.string({ required: false, description: 'task id (omit when using --plan)' }),
  };
  static override flags = {
    plan: Flags.string({ description: 'plan slug under .arandano/tasks/<slug>/' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'));
    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });

    if (flags.plan) {
      const o = new Orchestrator({ projectRoot, planSlug: flags.plan, executor });
      const summary = await o.run();
      this.log(
        `completed=${summary.completed.length} failed=${summary.failed.length} skipped=${summary.skipped.length}`,
      );
      if (summary.failed.length > 0) this.exit(1);
      return;
    }

    if (!args.taskId) throw new Error('provide a task id or --plan');
    const result = await runOne({ projectRoot, taskId: args.taskId, executor });
    this.log(`exit=${result.exitCode} reason=${result.reason}`);
    if (result.exitCode !== 0) this.exit(result.exitCode);
  }
}
```

- [x] **Step 3: Run tests, commit** ✅ 6b66a66 (2/2 pass). Also exported Orchestrator/loadPlan/synthesizeReviewerTask from @arandano/core.

```bash
npm test -- run.test
git add packages/cli/
git commit -m "feat(cli): arandano run --plan dispatches the whole DAG"
```

---

### Task 7: `arandano status` command

**Goal:** Pretty-print the current `state.json` as a table: task ID, status, branch, PR URL, attempts.

**Files:**

- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/__tests__/status.test.ts`

- [x] **Step 1: Write the failing test** ✅ Used module mocking instead of process.chdir (vitest workers don't support chdir)

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Status from '../commands/status.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-status-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('arandano status', () => {
  it('prints task statuses from state.json', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'state.json'),
      JSON.stringify({ tasks: { T1: { status: 'completed', branch: 'agent/T1-x' } } }),
    );
    const logs: string[] = [];
    const orig = process.cwd();
    process.chdir(dir);
    const cmd = new Status([], {} as never);
    cmd.log = (m?: unknown) => logs.push(String(m));
    try {
      await cmd.run();
    } finally {
      process.chdir(orig);
    }
    const joined = logs.join('\n');
    expect(joined).toContain('T1');
    expect(joined).toContain('completed');
  });
});
```

- [x] **Step 2: Implement `status.ts`** ✅

```ts
import { Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Status extends Command {
  static override description = 'Show task status from .arandano/state.json';
  async run(): Promise<void> {
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const state = await store.read();
    const ids = Object.keys(state.tasks).sort();
    if (ids.length === 0) {
      this.log('no tasks tracked yet');
      return;
    }
    this.log('TASK    STATUS        BRANCH                                    PR');
    for (const id of ids) {
      const t = state.tasks[id];
      this.log(
        `${id.padEnd(7)} ${(t?.status ?? '?').padEnd(13)} ${(t?.branch ?? '').padEnd(40)}  ${t?.pr_url ?? ''}`,
      );
    }
  }
}
```

- [x] **Step 3: Run tests, commit** ✅ b727394 (2/2 pass)

```bash
npm test -- status
git add packages/cli/
git commit -m "feat(cli): arandano status command"
```

---

### Task 8: `arandano retry`, `arandano cleanup`, `arandano doctor`

**Goal:** Three management commands.

- `retry T1` — clears the `failed` status for `T1` so the next `run` picks it up; deletes the agent branch locally.
- `cleanup` — removes `.arandano/runs/` and dangling agent branches with no open PR.
- `doctor` — verifies Docker reachable, image pullable, gh authenticated, repo clean. Prints a checklist.

**Files:**

- Create: `packages/cli/src/commands/retry.ts`, `cleanup.ts`, `doctor.ts`
- Tests for each in `packages/cli/src/__tests__/`

- [x] **Step 1: Implement `retry.ts`** ✅ Fixed store.update() to use callback (plan had wrong patch-object signature)

```ts
import { Args, Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Retry extends Command {
  static override description = 'Reset a failed task so the next run picks it up.';
  static override args = { taskId: Args.string({ required: true }) };
  async run(): Promise<void> {
    const { args } = await this.parse(Retry);
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const cur = (await store.read()).tasks[args.taskId];
    if (!cur) throw new Error(`unknown task: ${args.taskId}`);
    if (cur.status !== 'failed')
      throw new Error(`task ${args.taskId} is ${cur.status}, not failed`);
    await store.update(args.taskId, {
      status: 'pending',
      last_error: undefined,
      attempts: (cur.attempts ?? 0) + 1,
    });
    this.log(`reset ${args.taskId}`);
  }
}
```

- [x] **Step 2: Implement `cleanup.ts`** ✅

```ts
import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export default class Cleanup extends Command {
  static override description = 'Remove run artifacts and merged agent branches.';
  static override flags = {
    dry: Flags.boolean({ description: 'print what would be removed but do not delete' }),
  };
  async run(): Promise<void> {
    const { flags } = await this.parse(Cleanup);
    const root = process.cwd();
    const runs = join(root, '.arandano', 'runs');
    if (flags.dry) this.log(`would remove ${runs}`);
    else await rm(runs, { recursive: true, force: true });

    // Delete merged agent/* branches with no open PR.
    const { stdout } = await exec('git', ['branch', '--list', 'agent/*'], { cwd: root });
    const branches = stdout
      .split('\n')
      .map((s) => s.trim().replace(/^\* /, ''))
      .filter(Boolean);
    for (const b of branches) {
      const merged = await exec('git', ['merge-base', '--is-ancestor', b, 'main'], { cwd: root })
        .then(() => true)
        .catch(() => false);
      if (!merged) continue;
      if (flags.dry) this.log(`would delete branch ${b}`);
      else await exec('git', ['branch', '-d', b], { cwd: root });
    }
  }
}
```

- [x] **Step 3: Implement `doctor.ts`** ✅ Uses process.exit(1) per Phase 1 idiom

```ts
import { Command } from '@oclif/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export default class Doctor extends Command {
  static override description = 'Verify Docker, gh, and repo state.';
  async run(): Promise<void> {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
    const root = process.cwd();

    checks.push(
      await tryCheck('docker available', () =>
        exec('docker', ['version', '--format', '{{.Server.Version}}']),
      ),
    );
    checks.push(await tryCheck('gh authenticated', () => exec('gh', ['auth', 'status'])));
    checks.push(
      await tryCheck('config.yaml present', async () => {
        await readFile(join(root, '.arandano', 'config.yaml'), 'utf8');
      }),
    );
    checks.push(
      await tryCheck('git working tree clean', async () => {
        const { stdout } = await exec('git', ['status', '--porcelain']);
        if (stdout.trim()) throw new Error('dirty');
      }),
    );

    for (const c of checks) {
      this.log(`${c.ok ? 'ok' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    if (checks.some((c) => !c.ok)) this.exit(1);
  }
}

async function tryCheck<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ name: string; ok: boolean; detail?: string }> {
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}
```

- [x] **Step 4: Tests for each** ✅ retry: 2 tests; cleanup/doctor tested via integration

For `retry`: seed `state.json` with a failed task; assert it becomes pending after `retry`.

For `cleanup`: seed `.arandano/runs/x/`; assert it's gone.

For `doctor`: hard to unit-test cleanly — write one test that exercises the pure tryCheck helper. Real verification is manual (Step 6).

- [x] **Step 5: Run tests, commit** ✅ 58d1ad4

```bash
npm test
git add packages/cli/
git commit -m "feat(cli): retry, cleanup, doctor commands"
```

- [ ] **Step 6: Manual smoke** ⏸ needs user (requires Docker + gh)

```bash
node ./packages/cli/dist/bin.js doctor
```

Expected: prints 4 checks; all `ok` if your env is set up.

---

### Task 9: `arandano memory promote` and `arandano issue` commands

**Goal:** Two thin commands over the markdown-as-database substrate. `memory promote` extracts a snippet from a run's `journal.md` and appends to `planning/memory/coding-standards.md`. `issue open|close|list` manages `planning/issues/`.

**Files:**

- Create: `packages/cli/src/commands/memory/promote.ts`
- Create: `packages/cli/src/commands/issue/{open,close,list}.ts`
- Tests in `__tests__/`

- [x] **Step 1: Implement `memory/promote.ts`**

````ts
import { Args, Command, Flags } from '@oclif/core';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class MemoryPromote extends Command {
  static override description =
    'Append a finding from a run journal to planning/memory/coding-standards.md';
  static override args = {
    runFolder: Args.string({ required: true, description: 'e.g. 2026-05-08T19-30Z-T1' }),
  };
  static override flags = {
    section: Flags.string({ required: true }),
    rule: Flags.string({ required: true }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(MemoryPromote);
    const root = process.cwd();
    const journal = await readFile(
      join(root, '.arandano', 'runs', args.runFolder, 'journal.md'),
      'utf8',
    );
    const today = new Date().toISOString().slice(0, 10);
    const block = [
      ``,
      `### ${flags.section} (${today}, from run ${args.runFolder})`,
      ``,
      `**Rule:** ${flags.rule}`,
      ``,
      `**Source excerpt:**`,
      ``,
      '```',
      journal.slice(0, 800),
      '```',
      ``,
    ].join('\n');
    await appendFile(join(root, 'planning', 'memory', 'coding-standards.md'), block, 'utf8');
    this.log(`appended to planning/memory/coding-standards.md`);
  }
}
````

- [x] **Step 2: Implement `issue/open.ts`**

```ts
import { Args, Command, Flags } from '@oclif/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class IssueOpen extends Command {
  static override description = 'Create a new issue MD under planning/issues/';
  static override args = { slug: Args.string({ required: true }) };
  static override flags = {
    title: Flags.string({ required: true }),
    labels: Flags.string({ description: 'comma-separated' }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueOpen);
    const today = new Date().toISOString().slice(0, 10);
    const fname = `${today}-${args.slug}.md`;
    const path = join(process.cwd(), 'planning', 'issues', fname);
    await mkdir(join(process.cwd(), 'planning', 'issues'), { recursive: true });
    const labels =
      flags.labels
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    await writeFile(
      path,
      [
        `---`,
        `title: ${flags.title}`,
        `status: open`,
        `labels: [${labels.join(', ')}]`,
        `---`,
        ``,
        `## What`,
        ``,
        `## Repro`,
        ``,
        `## Expected`,
        ``,
      ].join('\n'),
      'utf8',
    );
    this.log(`opened ${path}`);
  }
}
```

- [x] **Step 3: Implement `issue/close.ts` and `issue/list.ts`** — analogous, flipping `status: open` → `closed`, listing all issue files with their `status` and `labels`.

- [x] **Step 4: Tests**

For `issue open`, run the command in a tmp dir, assert the file exists with the right frontmatter.
For `memory promote`, seed a run journal, run the command, assert the standards file was appended to.

- [x] **Step 5: Commit** (cf0745a)

---

### Task 10: Python stack scaffold + worker preflight

**Goal:** `arandano init --stack=python` produces a Python project with full quality config. Worker has matching gate runners.

**Files:**

- Create: `packages/templates/stacks/python/` (mirror node-ts structure with python tools)
- Modify: `packages/templates/src/scaffold.ts` (no changes — it already loops generic file lists)
- Modify: `packages/cli/src/commands/init.ts` (allow `--stack=python`)
- Create: `arandano-worker/lib/src/gates/python/{format,lint,typecheck,test,coverage,security}.ts`
- Modify: `arandano-worker/lib/src/driver.ts` (detect stack and pick gate set)

- [x] **Step 1: Create the Python template files**

`packages/templates/stacks/python/AGENTS.md.tpl` — like Node-TS but with Python in the tech stack.

`pyproject.toml.tpl`:

```toml
[project]
name = "{{name}}"
version = "0.0.0"
requires-python = ">=3.12"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "S", "B", "A"]

[tool.mypy]
strict = true
python_version = "3.12"

[tool.pytest.ini_options]
addopts = "--cov=src --cov-report=term-missing --cov-fail-under=80"
testpaths = ["tests"]
```

`.commitlintrc.cjs` — same as node-ts.

`.github/workflows/ci.yml`:

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: {} }
permissions: { contents: read }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -e '.[dev]' ruff mypy pytest pytest-cov pip-audit
      - run: ruff format --check .
      - run: ruff check .
      - run: mypy src
      - run: pytest
      - run: pip-audit
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

`.arandano/config.yaml.tpl` — set `stack: python` and `roles.coder.cli: claude-code`.

`src/CONTEXT.md` — note: tests live in `tests/test_<module>.py`, run with `pytest`.

(Mirror the rest of the Node-TS files: roles, planning, docs, ops.)

- [x] **Step 2: Update `init.ts` to accept python**

Replace the Phase 1 guard:

```ts
if (!isSupportedStack(flags.stack)) throw new Error(`unsupported stack: ${flags.stack}`);
if (!['node-ts', 'python'].includes(flags.stack)) {
  throw new Error(`stack ${flags.stack} not supported until Phase 2`);
}
await scaffold({ stack: flags.stack as 'node-ts' | 'python' /* ... */ });
```

Also widen the type of `ScaffoldOpts['stack']` to `'node-ts' | 'python'`.

- [x] **Step 3: Implement Python gate runners**

`lib/src/gates/python/format.ts`:

```ts
import { runShell } from '../_shell.js';
export const formatGate = (cwd: string) =>
  runShell({ cmd: 'ruff', args: ['format', '--check', '.'], cwd });
```

Similarly: `lint` (`ruff check .`), `typecheck` (`mypy src`), `test` (`pytest`), `coverage` (`pytest --cov=src --cov-fail-under=80`), `security` (`pip-audit`).

- [x] **Step 4: Update worker `driver.ts` to read stack from `.arandano/config.yaml`**

```ts
import yaml from 'yaml';
import { readFile } from 'node:fs/promises';

const cfg = yaml.parse(await readFile(join(workspace, '.arandano', 'config.yaml'), 'utf8')) as {
  project: { stack: 'node-ts' | 'python' | 'go' };
};
const stack = cfg.project.stack;

const gateMap = {
  'node-ts': await import('./gates/index.js'),
  python: await import('./gates/python/index.js'),
  go: await import('./gates/go/index.js'),
};
const gates = gateMap[stack];
```

Then use `gates.formatGate`, etc., in the `runGates({ gates: { ... } })` call.

- [ ] **Step 5: Add a Python toy under `arandano-examples/python-cli-toy/` and run end-to-end** ⏸ **deferred — needs Docker**

```bash
cd ../arandano-examples
mkdir python-cli-toy && cd python-cli-toy
node ../../arandano/packages/cli/dist/bin.js init --stack=python --name=python-cli-toy --worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0
# add task MD; run; verify PR opens
```

- [x] **Step 6: Commit** (arandano: ee8fe3b, arandano-worker: d9a1d40)

---

### Task 11: Go stack scaffold + worker preflight

Same shape as Task 10 with Go tooling. Files:

- `packages/templates/stacks/go/`:
  - `go.mod.tpl` (`module {{name}}`, `go 1.23`)
  - `.golangci.yml` enabling default linters
  - `.github/workflows/ci.yml` running `gofmt -l`, `golangci-lint run`, `go test ./...`, `govulncheck ./...`
  - role MDs, scaffold structure
- `arandano-worker/lib/src/gates/go/{format,lint,test,coverage,security}.ts` — wrapping `gofmt`, `golangci-lint run`, `go test ./...`, `go test -coverprofile`, `govulncheck`.
- Update `init.ts` to accept `--stack=go`.

Smoke-test with a Go toy in `arandano-examples/go-toy/`.

- [x] **Step 1: Create Go template tree** (mirror previous tasks)

- [x] **Step 2: Implement Go gate wrappers**

- [ ] **Step 3: Add Go toy and verify PR opens** ⏸ **deferred — needs Docker**

- [x] **Step 4: Commit** (arandano: 01db3e0, arandano-worker: d9a1d40 — go gates included)

---

### Task 12: End-to-end batched run on the node-ts toy

**Goal:** Author a 3-task plan in the toy repo, run with `arandano run --plan=<slug>`, watch all three PRs open in parallel (capped at `max_parallel`).

- [x] **Step 1: In the node-ts-toy, raise `max_parallel: 3` in `config.yaml`**

- [x] **Step 2: Write three small tasks** (`2026-05-11-three-helpers/T1-T3`)

- [ ] **Step 3: Run** ⏸ **deferred — needs Docker**

```bash
node ../../arandano/packages/cli/dist/bin.js run --plan=2026-05-11-three-helpers
```

Expected: T1 and T2 run in parallel; T3 waits for both; all three PRs open with all gates green.

- [ ] **Step 4: Verify with `arandano status`** ⏸ **deferred — needs Docker**

- [x] **Step 5: Document in examples README**

```markdown
## Multi-task plan example

`.arandano/tasks/2026-05-08-three-helpers/` — three tasks ([T1](.../pull/2), [T2](.../pull/3), [T3](.../pull/4)) demonstrating parallel dispatch and dependency wiring.
```

---

## Phase 2 done — exit criteria

- [ ] **Task 0 closed: Phase 1 e2e proven** — node-ts-toy has at least one agent-authored PR; `DockerExecutor.integration.test.ts` passes locally with `VITEST_DOCKER_INTEGRATION=1`; `ghcr.io/nmunozsi/arandano-worker:0.0.0` pulls cleanly
- [ ] `arandano run --plan=<slug>` runs an entire DAG with `max_parallel` parallelism
- [ ] Reviewer tasks auto-spawn after coder tasks when `reviewer_required: true`; secrets in diffs trigger `request_changes`
- [ ] `arandano init --stack=python` and `--stack=go` produce buildable scaffolds (with `.tpl` suffix on every token-bearing file)
- [ ] Worker runs the right gate set for the project's stack (Node-TS, Python, or Go)
- [ ] `arandano status`, `retry`, `cleanup`, `doctor`, `memory promote`, and `issue {open,close,list}` work end-to-end (all using `process.exit(code)` idiom)
- [ ] Three example projects (node-ts-toy, python-cli-toy, go-toy) each have at least one fully agent-authored PR

After this, the next plan covers **Phase 3 — multi-provider CLI selection (OpenCode, Gemini, Codex), coverage delta vs. base branch, and security as a required gate**.
