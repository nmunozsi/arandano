> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T6-dockerexecutor-wiring.md`
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
> ├── T6-dockerexecutor-wiring.md                                        ← you are here
> ├── T7-single-task-orchestrator.md
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

### Task 6: DockerExecutor wiring (TDD with mocked dockerode)

**Goal:** Replace the Phase 0 stub `DockerExecutor` with a real implementation that calls `dockerode` via an injectable client factory.

**Files:**

- Create: `packages/executors-docker/src/client.ts`
- Modify: `packages/executors-docker/src/DockerExecutor.ts`
- Modify: `packages/executors-docker/src/__tests__/DockerExecutor.test.ts`
- Modify: `packages/executors-docker/package.json` (add `dockerode` and `@types/dockerode`)

- [x] **Step 1: Install dockerode**

```bash
npm install dockerode@4 -w packages/executors-docker
npm install -D @types/dockerode@3 -w packages/executors-docker
```

- [x] **Step 2: Create `packages/executors-docker/src/client.ts`**

```ts
import Docker from 'dockerode';

export interface DockerClient {
  createContainer(opts: unknown): Promise<{
    id: string;
    start(): Promise<void>;
    wait(): Promise<{ StatusCode: number }>;
    stop(opts?: { t: number }): Promise<void>;
    remove(opts?: { force: boolean }): Promise<void>;
    logs(opts: {
      stdout: boolean;
      stderr: boolean;
      follow: boolean;
    }): Promise<NodeJS.ReadableStream>;
  }>;
}

export function defaultClient(): DockerClient {
  const d = new Docker();
  return d as unknown as DockerClient;
}
```

- [x] **Step 3: Rewrite `packages/executors-docker/src/DockerExecutor.ts`**

```ts
import type { Executor, ExitResult, Handle, TaskRun } from '@arandano/core';
import { runArtifacts, runFolder } from '@arandano/core';
import { buildContainerSpec } from './containerSpec.js';
import { defaultClient, type DockerClient } from './client.js';

export interface DockerExecutorOpts {
  image: string;
  projectRoot: string;
  client?: DockerClient;
  hostEnv?: Record<string, string | undefined>;
  now?: () => Date;
}

interface InternalHandle extends Handle {
  containerId: string;
  runFolderName: string;
}

export class DockerExecutor implements Executor {
  private readonly running = new Map<
    string,
    {
      containerId: string;
      container: Awaited<ReturnType<DockerClient['createContainer']>>;
      folder: string;
    }
  >();
  private readonly opts: Required<Pick<DockerExecutorOpts, 'image' | 'projectRoot'>> &
    DockerExecutorOpts;

  constructor(opts: DockerExecutorOpts) {
    this.opts = {
      client: defaultClient(),
      hostEnv: process.env as Record<string, string | undefined>,
      now: () => new Date(),
      ...opts,
    };
  }

  async start(task: TaskRun): Promise<Handle> {
    const folder = runFolder({ taskId: task.taskId, date: this.opts.now!() });
    const spec = buildContainerSpec({
      task,
      image: this.opts.image,
      projectRoot: this.opts.projectRoot,
      runFolder: folder,
      hostEnv: this.opts.hostEnv!,
    });
    const container = await this.opts.client!.createContainer(spec as unknown);
    await container.start();
    const id = `${task.taskId}::${container.id}`;
    this.running.set(id, { containerId: container.id, container, folder });
    return { id };
  }

  async wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult> {
    const entry = this.running.get(h.id);
    if (!entry) throw new Error(`unknown handle: ${h.id}`);
    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          void entry.container.stop({ t: 5 });
        }, opts.timeoutMs)
      : null;
    try {
      const { StatusCode } = await entry.container.wait();
      const artifacts = runArtifacts({ projectRoot: this.opts.projectRoot, folder: entry.folder });
      const reason = StatusCode === 0 ? 'ok' : 'error';
      return {
        exitCode: StatusCode,
        reason,
        resultJsonPath: artifacts.result,
        journalPath: artifacts.journal,
      };
    } finally {
      if (timer) clearTimeout(timer);
      await entry.container.remove({ force: true }).catch(() => {});
      this.running.delete(h.id);
    }
  }

  async *logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string> {
    const entry = this.running.get(h.id);
    if (!entry) throw new Error(`unknown handle: ${h.id}`);
    const stream = await entry.container.logs({
      stdout: true,
      stderr: true,
      follow: opts?.follow ?? false,
    });
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      yield chunk.toString('utf8');
    }
  }

  async cancel(h: Handle): Promise<void> {
    const entry = this.running.get(h.id);
    if (!entry) return;
    await entry.container.stop({ t: 5 }).catch(() => {});
  }
}
```

- [x] **Step 4: Replace tests with real ones**

`packages/executors-docker/src/__tests__/DockerExecutor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

function fakeContainer() {
  return {
    id: 'cont-123',
    start: vi.fn(async () => {}),
    wait: vi.fn(async () => ({ StatusCode: 0 })),
    stop: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    logs: vi.fn(async () => {
      const { Readable } = await import('node:stream');
      return Readable.from([Buffer.from('hello\n')]);
    }),
  };
}

const task: TaskRun = {
  taskId: 'T1',
  taskMdPath: 'p',
  rolePath: 'r',
  contextPaths: [],
  cli: 'claude-code',
  model: 'claude-sonnet-4-6',
  tdd: 'strict',
  quality: {
    format: 'required',
    lint: 'required',
    typecheck: 'required',
    test: 'required',
    coverage: { min: 80, delta: 'any' },
    security: 'warn',
    commit_msg: 'conventional',
    reviewer_required: false,
  },
  envPass: [],
  workdir: '/workspace',
  timeoutMs: 60_000,
  mcpServers: [],
};

describe('DockerExecutor', () => {
  it('starts a container and returns a handle', async () => {
    const c = fakeContainer();
    const client = { createContainer: vi.fn(async () => c) };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date('2026-05-08T19:30:00Z'),
    });
    const h = await exec.start(task);
    expect(h.id).toContain('T1');
    expect(c.start).toHaveBeenCalled();
  });

  it('reports ok exit when container exits 0', async () => {
    const c = fakeContainer();
    const client = { createContainer: vi.fn(async () => c) };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
    });
    const h = await exec.start(task);
    const res = await exec.wait(h);
    expect(res.exitCode).toBe(0);
    expect(res.reason).toBe('ok');
    expect(res.resultJsonPath).toContain('result.json');
  });

  it('reports error exit when container exits non-zero', async () => {
    const c = fakeContainer();
    c.wait = vi.fn(async () => ({ StatusCode: 7 }));
    const client = { createContainer: vi.fn(async () => c) };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
    });
    const h = await exec.start(task);
    const res = await exec.wait(h);
    expect(res.exitCode).toBe(7);
    expect(res.reason).toBe('error');
  });

  it('cancel calls stop on the container', async () => {
    const c = fakeContainer();
    const client = { createContainer: vi.fn(async () => c) };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
    });
    const h = await exec.start(task);
    await exec.cancel(h);
    expect(c.stop).toHaveBeenCalled();
  });
});
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- DockerExecutor
```

- [x] **Step 6: Commit**

```bash
git add packages/executors-docker/
git commit -m "feat(executors-docker): wire dockerode start/wait/logs/cancel"
```

---
