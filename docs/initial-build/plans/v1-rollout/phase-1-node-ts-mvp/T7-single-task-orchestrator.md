> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T7-single-task-orchestrator.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md
> ├── T4-run-folder-layout-helpers.md
> ├── T5-container-spec-builder.md
> ├── T6-dockerexecutor-wiring.md
> ├── T7-single-task-orchestrator.md                                     ← you are here
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 7: Single-task orchestrator (TDD)

**Goal:** `runOne(opts)` reads the task MD, builds the `TaskRun`, dispatches via the executor, and returns the result. State is updated via `StateStore`.

**Files:**

- Create: `packages/core/src/orchestrator/runOne.ts`
- Create: `packages/core/src/orchestrator/__tests__/runOne.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/orchestrator/__tests__/runOne.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOne } from '../runOne.js';
import type { Executor } from '../../types/executor.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-runone-'));
  return async () => rm(dir, { recursive: true, force: true });
});

async function seedProject() {
  await mkdir(join(dir, '.arandano', 'tasks', 'p'), { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'planning', 'memory'), { recursive: true });
  await writeFile(join(dir, 'src', 'CONTEXT.md'), '# src');
  await writeFile(join(dir, 'planning', 'memory', 'coding-standards.md'), '# standards');
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '# coder');
  await writeFile(
    join(dir, '.arandano', 'tasks', 'p', 'T1-foo.md'),
    '---\nid: T1\ntitle: foo\nrole: coder\n---\nbody',
  );
  await writeFile(
    join(dir, '.arandano', 'config.yaml'),
    `project: { name: x, default_branch: main }
executor: { backend: docker, docker: { image: img, workdir: /workspace, plugins_mount: baked-in, env_pass: [] } }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: true }
roles: { coder: { cli: claude-code, model: claude-sonnet-4-6, tdd: strict } }
quality_defaults: { format: required, lint: required, typecheck: required, test: required, coverage: { min: 80, delta: any }, security: warn, commit_msg: conventional, reviewer_required: false }
batching: { max_parallel: 1, timeout_minutes: 45, retry_policy: { max_attempts: 1, on: [container_error] } }
`,
  );
}

const okExecutor = (): Executor => ({
  start: vi.fn(async () => ({ id: 'h-1' })),
  wait: vi.fn(async () => ({ exitCode: 0, reason: 'ok' as const })),
  logs: vi.fn(async function* () {}),
  cancel: vi.fn(async () => {}),
});

describe('runOne', () => {
  it('marks the task completed when the executor returns ok', async () => {
    await seedProject();
    const exec = okExecutor();
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.exitCode).toBe(0);
    expect(exec.start).toHaveBeenCalledTimes(1);
  });

  it('marks the task failed when the executor returns non-zero', async () => {
    await seedProject();
    const exec = {
      ...okExecutor(),
      wait: vi.fn(async () => ({ exitCode: 1, reason: 'error' as const })),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.exitCode).toBe(1);
  });

  it('errors when the task id does not exist', async () => {
    await seedProject();
    await expect(
      runOne({ projectRoot: dir, taskId: 'T999', executor: okExecutor() }),
    ).rejects.toThrow(/T999/);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npm test -- runOne
```

- [x] **Step 3: Implement `packages/core/src/orchestrator/runOne.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config/load.js';
import { parseTaskMd } from '../parsers/task-md.js';
import { StateStore } from '../state/store.js';
import type { Executor, ExitResult } from '../types/executor.js';
import type { TaskRun } from '../types/executor.js';

export interface RunOneOpts {
  projectRoot: string;
  taskId: string;
  executor: Executor;
}

export async function runOne(opts: RunOneOpts): Promise<ExitResult> {
  const { projectRoot, taskId, executor } = opts;

  const cfgText = await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8');
  const cfg = loadConfig(cfgText);

  const taskPath = await findTaskMd(projectRoot, taskId);
  if (!taskPath) throw new Error(`task not found: ${taskId}`);
  const taskMd = parseTaskMd(await readFile(taskPath, 'utf8'), taskPath);

  const roleName = taskMd.frontmatter.role;
  const role = cfg.roles[roleName];
  if (!role) throw new Error(`role not configured: ${roleName}`);

  const taskRun: TaskRun = {
    taskId: taskMd.frontmatter.id,
    taskMdPath: relative(projectRoot, taskPath),
    rolePath: `.arandano/roles/${roleName}.md`,
    contextPaths: ['src/CONTEXT.md', 'planning/memory/coding-standards.md'],
    cli: taskMd.frontmatter.cli ?? role.cli,
    model: taskMd.frontmatter.model ?? role.model,
    tdd: taskMd.frontmatter.tdd ?? role.tdd ?? 'strict',
    quality: { ...cfg.quality_defaults, ...(taskMd.frontmatter.quality ?? {}) } as never,
    envPass: cfg.executor.docker?.env_pass ?? [],
    workdir: cfg.executor.docker?.workdir ?? '/workspace',
    timeoutMs: (taskMd.frontmatter.timeout_minutes ?? cfg.batching.timeout_minutes) * 60_000,
    mcpServers: taskMd.frontmatter.mcp ?? [],
  };

  const store = new StateStore(join(projectRoot, '.arandano', 'state.json'));
  await store.update(taskRun.taskId, { status: 'in_progress' });

  const handle = await executor.start(taskRun);
  const result = await executor.wait(handle, { timeoutMs: taskRun.timeoutMs });
  await store.update(taskRun.taskId, {
    status: result.reason === 'ok' ? 'completed' : 'failed',
    last_error: result.reason !== 'ok' ? result.reason : undefined,
  });

  return result;
}

async function findTaskMd(root: string, id: string): Promise<string | undefined> {
  const pattern = join(root, '.arandano', 'tasks', '**', `${id}-*.md`);
  for await (const match of glob(pattern)) return match;
  return undefined;
}

function relative(from: string, to: string): string {
  return to.startsWith(from + '/') ? to.slice(from.length + 1) : to;
}
```

- [x] **Step 4: Export and run**

Add to `packages/core/src/index.ts`:

```ts
export { runOne } from './orchestrator/runOne.js';
export type { RunOneOpts } from './orchestrator/runOne.js';
```

```bash
npm test -- runOne
```

Expected: 3 tests pass.

- [x] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): single-task orchestrator (runOne)"
```

---
