> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T3-orchestrator-class-drives-a-plan-to-completion.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md              ← you are here
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
