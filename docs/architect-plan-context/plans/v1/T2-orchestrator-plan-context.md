> **Location:** `docs/architect-plan-context/plans/v1/T2-orchestrator-plan-context.md`

# T2 — Orchestrator: write plan-context.json, inject context env vars, remove gitMergeRange

**Repo:** `arandano` (monorepo)

**Files:**

- Modify: `packages/core/src/orchestrator/orchestrator.ts`
- Modify: `packages/core/src/orchestrator/__tests__/orchestrator.test.ts`

**Context:** Before dispatching T-architect the orchestrator must write `.arandano/runs/<planSlug>-context.json` containing completed coder tasks with their branches and PR URLs (now available in `state.json` thanks to T1). It then sets `ARANDANO_PLAN_CONTEXT_PATH` (workdir-relative file path, for Docker) and `ARANDANO_PLAN_CONTEXT_JSON` (inline serialised JSON, for k8s). This task also removes `gitMergeRange` (the git shell-out added in a prior session) and `ARANDANO_PLAN_MERGE_RANGE` from the envOverride.

**Prerequisite:** T1 must be done — the new tests here require `branch` to appear in `state.json`.

---

- [ ] **Step 1: Update the existing `ARANDANO_PLAN_MERGE_RANGE` test to assert its removal**

In `orchestrator.test.ts`, find the test:

```typescript
it('passes ARANDANO_PLAN_MERGE_RANGE to T-architect task', async () => {
```

Replace the entire test with:

```typescript
it('passes ARANDANO_PLAN_CONTEXT_PATH and ARANDANO_PLAN_CONTEXT_JSON to T-architect; does not pass ARANDANO_PLAN_MERGE_RANGE', async () => {
  const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
  await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
  await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
  const cfg = CONFIG(2).replace(
    'roles:\n  coder:',
    'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
  );
  await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

  const capturedRuns: TaskRun[] = [];
  const exec: Executor = {
    start: vi.fn((t) => {
      capturedRuns.push(t);
      return Promise.resolve({ id: t.taskId });
    }),
    wait: vi.fn(async (h) => {
      if (h.id !== 'T-architect') {
        const runDir = join(dir, '.arandano', 'runs', h.id);
        await mkdir(runDir, { recursive: true });
        const resultPath = join(runDir, 'result.json');
        await writeFile(
          resultPath,
          JSON.stringify({
            branch: `agent/${h.id}-123`,
            pr_url: `https://github.com/org/repo/pull/1`,
          }),
        );
        return { exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath };
      }
      return { exitCode: 0, reason: 'ok' as const };
    }),
    logs: vi.fn(() => (async function* () {})()),
    cancel: vi.fn(() => Promise.resolve()),
  };

  await new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec }).run();

  const archRun = capturedRuns.find((r) => r.taskId === 'T-architect');
  expect(archRun?.envSet?.['ARANDANO_PLAN_SLUG']).toBe('p');
  expect(archRun?.envSet?.['ARANDANO_PLAN_CONTEXT_PATH']).toBe('.arandano/runs/p-context.json');
  expect(archRun?.envSet?.['ARANDANO_PLAN_CONTEXT_JSON']).toBeDefined();
  const ctx = JSON.parse(archRun!.envSet!['ARANDANO_PLAN_CONTEXT_JSON']!) as {
    planSlug: string;
    tasks: Array<{ id: string; branch: string; prUrl?: string }>;
  };
  expect(ctx.planSlug).toBe('p');
  expect(ctx.tasks[0]?.id).toBe('T1');
  expect(ctx.tasks[0]?.branch).toBe('agent/T1-123');
  expect(ctx.tasks[0]?.prUrl).toBe('https://github.com/org/repo/pull/1');
  expect(archRun?.envSet?.['ARANDANO_PLAN_MERGE_RANGE']).toBeUndefined();
});
```

Also add this test for the exclusion rules:

```typescript
it('excludes failed coder tasks and tasks with no branch from plan-context.json', async () => {
  const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'q');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
  await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
  await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
  await writeFile(join(planDir, 'T2-x.md'), '---\nid: T2\ntitle: x\nrole: coder\n---\nbody');
  const cfg = CONFIG(2).replace(
    'roles:\n  coder:',
    'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
  );
  await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

  const capturedRuns: TaskRun[] = [];
  const exec: Executor = {
    start: vi.fn((t) => {
      capturedRuns.push(t);
      return Promise.resolve({ id: t.taskId });
    }),
    wait: vi.fn(async (h) => {
      if (h.id === 'T1') {
        // T1 succeeds with a branch
        const runDir = join(dir, '.arandano', 'runs', h.id);
        await mkdir(runDir, { recursive: true });
        const resultPath = join(runDir, 'result.json');
        await writeFile(resultPath, JSON.stringify({ branch: 'agent/T1-123' }));
        return { exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath };
      }
      if (h.id === 'T2') {
        // T2 succeeds but has no branch in result.json
        return { exitCode: 0, reason: 'ok' as const };
      }
      return { exitCode: 0, reason: 'ok' as const };
    }),
    logs: vi.fn(() => (async function* () {})()),
    cancel: vi.fn(() => Promise.resolve()),
  };

  await new Orchestrator({ projectRoot: dir, planSlug: 'q', executor: exec }).run();

  const archRun = capturedRuns.find((r) => r.taskId === 'T-architect');
  const ctx = JSON.parse(archRun!.envSet!['ARANDANO_PLAN_CONTEXT_JSON']!) as {
    tasks: Array<{ id: string }>;
  };
  expect(ctx.tasks.map((t) => t.id)).toEqual(['T1']);
});
```

- [ ] **Step 2: Run the new/updated tests — expect them to fail**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="ARANDANO_PLAN_CONTEXT|plan-context"
```

Expected: failures (env vars not set yet, gitMergeRange still present).

- [ ] **Step 3: Update `orchestrator.ts` — imports**

Replace the current top imports:

```typescript
// REMOVE these two lines:
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// CHANGE this line from:
import { readFile, writeFile } from 'node:fs/promises';
// TO:
import { mkdir, readFile, writeFile } from 'node:fs/promises';
```

The full new import block at the top of `orchestrator.ts`:

```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { loadConfig } from '../config/load.js';
import { loadPlan } from '../tasks/loadPlan.js';
import { StateStore } from '../state/store.js';
import { selectReadyBatch, validateDag } from './dag.js';
import { runOne } from './runOne.js';
import type { Executor, ExitResult } from '../types/executor.js';
import type { TaskFrontmatter } from '../types/task.js';
import { synthesizeReviewerTask } from '../reviewer/synthesizeReviewerTask.js';
import { synthesizeArchitectTask, type RunShape } from '../architect/synthesizeArchitectTask.js';
```

- [ ] **Step 4: Remove `execFileAsync` and `gitMergeRange` from `orchestrator.ts`**

Delete these lines entirely (they appear near the top of the file, after the imports):

```typescript
const execFileAsync = promisify(execFile);

async function gitMergeRange(projectRoot: string, defaultBranch: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-C',
      projectRoot,
      'log',
      '--format=%H',
      `${defaultBranch}..HEAD`,
    ]);
    return stdout.trim();
  } catch {
    return '';
  }
}
```

- [ ] **Step 5: Replace the T-architect dispatch block in `orchestrator.ts`**

Find this block inside the `for (const id of ready)` loop:

```typescript
let envOverride: Record<string, string> | undefined;
if (id === 'T-architect') {
  const mergeRange = await gitMergeRange(projectRoot, cfg.project.default_branch);
  envOverride = {
    ARANDANO_PLAN_SLUG: planSlug,
    ARANDANO_PLAN_MERGE_RANGE: mergeRange,
  };
}
```

Replace with:

```typescript
let envOverride: Record<string, string> | undefined;
if (id === 'T-architect') {
  const currentState = await store.read();
  const planContextTasks = fms
    .filter((t) => t.role === 'coder' && currentState.tasks[t.id]?.branch)
    .map((t) => ({
      id: t.id,
      branch: currentState.tasks[t.id]!.branch!,
      ...(currentState.tasks[t.id]?.pr_url ? { prUrl: currentState.tasks[t.id]!.pr_url } : {}),
    }));
  const planContext = {
    planSlug,
    defaultBranch: cfg.project.default_branch,
    tasks: planContextTasks,
  };
  const contextRelPath = `.arandano/runs/${planSlug}-context.json`;
  await mkdir(join(projectRoot, '.arandano', 'runs'), { recursive: true });
  await writeFile(join(projectRoot, contextRelPath), JSON.stringify(planContext, null, 2));
  envOverride = {
    ARANDANO_PLAN_SLUG: planSlug,
    ARANDANO_PLAN_CONTEXT_PATH: contextRelPath,
    ARANDANO_PLAN_CONTEXT_JSON: JSON.stringify(planContext),
  };
}
```

- [ ] **Step 6: Run the updated tests — expect all to pass**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="ARANDANO_PLAN_CONTEXT|plan-context|ARANDANO_PLAN_MERGE_RANGE"
```

Expected: all pass.

- [ ] **Step 7: Run the full monorepo test suite — expect no regressions**

```
npm test
```

Expected: all tests pass. The previously-added `passes ARANDANO_PLAN_MERGE_RANGE to T-architect task` test is now replaced, so there should be no failure from it.

- [ ] **Step 8: Commit**

```
git add packages/core/src/orchestrator/orchestrator.ts packages/core/src/orchestrator/__tests__/orchestrator.test.ts
git commit -m ":sparkles: feat(orchestrator): write plan-context.json and inject context env vars for T-architect"
```
