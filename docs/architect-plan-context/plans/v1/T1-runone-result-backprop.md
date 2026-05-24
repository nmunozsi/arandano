> **Location:** `docs/architect-plan-context/plans/v1/T1-runone-result-backprop.md`

# T1 — runOne: back-propagate branch and pr_url from result.json to state.json

**Repo:** `arandano` (monorepo)

**Files:**

- Modify: `packages/core/src/orchestrator/runOne.ts`
- Modify: `packages/core/src/orchestrator/__tests__/runOne.test.ts`

**Context:** Each worker container writes a `result.json` to `.arandano/runs/<folder>/result.json` with fields including `branch` and `pr_url`. `ExitResult` (returned by `executor.wait()`) already carries `resultJsonPath` pointing to that file. Today `runOne` ignores it — so `TaskState.branch` and `TaskState.pr_url` are always undefined. The orchestrator needs them populated before it can write `plan-context.json` in T2.

---

- [ ] **Step 1: Write three failing tests in `runOne.test.ts`**

Add a new `describe` block after the existing ones. The `okExecutor` function already exists in the file; use it as a base. You need `mkdir` and `readFile` imports — add them to the existing import line.

```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
// ... rest of imports unchanged
```

New test block to add at the bottom of the file:

```typescript
describe('runOne — result.json back-propagation', () => {
  it('writes branch and pr_url to state.json after a successful run', async () => {
    await seedProject();
    const runDir = join(dir, '.arandano', 'runs', 'test-run');
    await mkdir(runDir, { recursive: true });
    const resultPath = join(runDir, 'result.json');
    await writeFile(
      resultPath,
      JSON.stringify({ branch: 'agent/T1-1234', pr_url: 'https://github.com/org/repo/pull/7' }),
    );
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({ exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath }),
      ),
    };
    await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    const state = JSON.parse(await readFile(join(dir, '.arandano', 'state.json'), 'utf8')) as {
      tasks: Record<string, { branch?: string; pr_url?: string }>;
    };
    expect(state.tasks['T1']?.branch).toBe('agent/T1-1234');
    expect(state.tasks['T1']?.pr_url).toBe('https://github.com/org/repo/pull/7');
  });

  it('completes successfully when resultJsonPath points to a missing file', async () => {
    await seedProject();
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({
          exitCode: 0,
          reason: 'ok' as const,
          resultJsonPath: join(dir, 'does-not-exist.json'),
        }),
      ),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.reason).toBe('ok');
  });

  it('completes successfully when result.json contains malformed JSON', async () => {
    await seedProject();
    const runDir = join(dir, '.arandano', 'runs', 'bad-run');
    await mkdir(runDir, { recursive: true });
    const resultPath = join(runDir, 'result.json');
    await writeFile(resultPath, 'not valid json {{{');
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({ exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath }),
      ),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.reason).toBe('ok');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="back-propagation"
```

Expected: 3 tests fail — the first with an assertion error (branch is undefined), the other two may pass or fail depending on current error handling.

- [ ] **Step 3: Implement back-propagation in `runOne.ts`**

The full new content of `runOne.ts` — only the section after `executor.wait()` changes:

```typescript
import { glob, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadConfig } from '../config/load.js';
import { parseTaskMd } from '../parsers/task-md.js';
import { StateStore } from '../state/store.js';
import type { Executor, ExitResult, TaskRun } from '../types/executor.js';

export interface RunOneOpts {
  projectRoot: string;
  taskId: string;
  executor: Executor;
  taskFilePath?: string;
  envOverride?: Record<string, string>;
}

export async function runOne(opts: RunOneOpts): Promise<ExitResult> {
  const { projectRoot, taskId, executor } = opts;

  const cfgText = await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8');
  const cfg = loadConfig(cfgText);

  const taskPath = opts.taskFilePath ?? (await findTaskMd(projectRoot, taskId));
  if (!taskPath) throw new Error(`task not found: ${taskId}`);
  const taskMd = parseTaskMd(await readFile(taskPath, 'utf8'), taskPath);

  const roleName = taskMd.frontmatter.role;
  const role = cfg.roles[roleName];
  if (!role) throw new Error(`role not configured: ${roleName}`);

  const taskRun: TaskRun = {
    taskId: taskMd.frontmatter.id,
    taskMdPath: relative(projectRoot, taskPath).replaceAll('\\', '/'),
    rolePath: `.arandano/roles/${roleName}.md`,
    contextPaths: ['src/CONTEXT.md', 'planning/memory/coding-standards.md'],
    cli: taskMd.frontmatter.cli ?? role.cli,
    model: taskMd.frontmatter.model ?? role.model,
    tdd: taskMd.frontmatter.tdd ?? role.tdd ?? 'strict',
    quality: { ...cfg.quality_defaults, ...(taskMd.frontmatter.quality ?? {}) } as never,
    envPass: cfg.executor.docker?.env_pass ?? [],
    ...(opts.envOverride !== undefined ? { envSet: opts.envOverride } : {}),
    workdir: cfg.executor.docker?.workdir ?? '/workspace',
    timeoutMs: (taskMd.frontmatter.timeout_minutes ?? cfg.batching.timeout_minutes) * 60_000,
    mcpServers: taskMd.frontmatter.mcp ?? [],
  };

  const store = new StateStore(join(projectRoot, '.arandano', 'state.json'));
  await store.update((state) => {
    const existing = state.tasks[taskRun.taskId];
    state.tasks[taskRun.taskId] = {
      retry_count: existing?.retry_count ?? 0,
      status: 'running',
      started_at: new Date().toISOString(),
    };
  });

  const handle = await executor.start(taskRun);
  const result = await executor.wait(handle, { timeoutMs: taskRun.timeoutMs });

  await store.update((state) => {
    const existing = state.tasks[taskRun.taskId] ?? { retry_count: 0, status: 'running' as const };
    state.tasks[taskRun.taskId] = {
      ...existing,
      status: result.reason === 'ok' ? 'completed' : 'failed',
      finished_at: new Date().toISOString(),
      ...(result.reason !== 'ok' ? { error: result.reason } : {}),
    };
  });

  if (result.reason === 'ok' && result.resultJsonPath) {
    try {
      const raw = await readFile(result.resultJsonPath, 'utf8');
      const r = JSON.parse(raw) as { branch?: unknown; pr_url?: unknown };
      if (typeof r.branch === 'string' || typeof r.pr_url === 'string') {
        await store.update((state) => {
          const t = state.tasks[taskRun.taskId];
          if (!t) return;
          if (typeof r.branch === 'string') t.branch = r.branch;
          if (typeof r.pr_url === 'string') t.pr_url = r.pr_url;
        });
      }
    } catch {
      // result.json absent or malformed — task still completed, silently skip
    }
  }

  return result;
}

async function findTaskMd(root: string, id: string): Promise<string | undefined> {
  const pattern = join(root, '.arandano', 'specs', '**', `${id}-*.md`).replaceAll('\\', '/');
  for await (const match of glob(pattern)) return match;
  return undefined;
}
```

- [ ] **Step 4: Run the three new tests — expect all to pass**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="back-propagation"
```

Expected: `3 passed`.

- [ ] **Step 5: Run the full test suite — expect no regressions**

```
npm test --workspace packages/core
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/core/src/orchestrator/runOne.ts packages/core/src/orchestrator/__tests__/runOne.test.ts
git commit -m ":sparkles: feat(core): back-propagate branch and pr_url from result.json to state.json"
```
