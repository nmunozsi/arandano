> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T3-k8sexecutor-wiring-against-kubernetes-client-node.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md
> ├── T1-scaffold-arandano-executors-k8s-package.md
> ├── T2-job-spec-builder.md
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md          ← you are here
> ├── T4-config-schema-for-executor-backend-k8s.md
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 3: K8sExecutor wiring against `@kubernetes/client-node` (TDD with mocks)

**Goal:** Implement `start`/`wait`/`logs`/`cancel` against a stubbed `BatchV1Api`/`CoreV1Api`. Wait polls Job status with exponential backoff.

**Files:**

- Create: `packages/executors-k8s/src/client.ts`
- Create: `packages/executors-k8s/src/watchJob.ts`
- Create: `packages/executors-k8s/src/K8sExecutor.ts`
- Create: `packages/executors-k8s/src/__tests__/K8sExecutor.test.ts`

- [ ] **Step 1: Implement `client.ts`**

```ts
import { KubeConfig, BatchV1Api, CoreV1Api } from '@kubernetes/client-node';

export interface K8sClients {
  batch: BatchV1Api;
  core: CoreV1Api;
}

export function defaultClients(opts?: { kubeconfigPath?: string; context?: string }): K8sClients {
  const cfg = new KubeConfig();
  if (opts?.kubeconfigPath) cfg.loadFromFile(opts.kubeconfigPath);
  else cfg.loadFromDefault();
  if (opts?.context) cfg.setCurrentContext(opts.context);
  return { batch: cfg.makeApiClient(BatchV1Api), core: cfg.makeApiClient(CoreV1Api) };
}
```

- [ ] **Step 2: Implement `watchJob.ts`** — poll until succeeded/failed/timeout.

```ts
import type { K8sClients } from './client.js';

export interface JobOutcome {
  status: 'succeeded' | 'failed' | 'timeout';
  message?: string;
}

export async function watchJob(opts: {
  clients: K8sClients;
  namespace: string;
  jobName: string;
  timeoutMs: number;
  pollMs?: number;
}): Promise<JobOutcome> {
  const deadline = Date.now() + opts.timeoutMs;
  const poll = opts.pollMs ?? 2_000;
  while (Date.now() < deadline) {
    const r = await opts.clients.batch.readNamespacedJob({
      name: opts.jobName,
      namespace: opts.namespace,
    });
    const s = r.status;
    if (s?.succeeded && s.succeeded > 0) return { status: 'succeeded' };
    if (s?.failed && s.failed > 0)
      return { status: 'failed', message: s.conditions?.find((c) => c.type === 'Failed')?.message };
    await new Promise((r) => setTimeout(r, poll));
  }
  return { status: 'timeout' };
}
```

- [ ] **Step 3: Implement `K8sExecutor.ts`**

```ts
import type { Executor, ExitResult, Handle, TaskRun } from '@arandano/core';
import { runFolder } from '@arandano/core';
import { buildJobSpec } from './jobSpec.js';
import { defaultClients, type K8sClients } from './client.js';
import { watchJob } from './watchJob.js';

export interface K8sExecutorOpts {
  image: string;
  namespace: string;
  gitUrl: string;
  gitRef: string;
  clients?: K8sClients;
  hostEnv?: Record<string, string | undefined>;
  now?: () => Date;
}

interface State {
  jobName: string;
  folder: string;
}

export class K8sExecutor implements Executor {
  private readonly state = new Map<string, State>();
  private readonly opts: Required<
    Pick<K8sExecutorOpts, 'image' | 'namespace' | 'gitUrl' | 'gitRef'>
  > &
    K8sExecutorOpts;

  constructor(opts: K8sExecutorOpts) {
    this.opts = {
      clients: opts.clients ?? defaultClients(),
      hostEnv: opts.hostEnv ?? (process.env as never),
      now: opts.now ?? (() => new Date()),
      ...opts,
    };
  }

  async start(task: TaskRun): Promise<Handle> {
    const folder = runFolder({ taskId: task.taskId, date: this.opts.now!() });
    const job = buildJobSpec({
      task,
      image: this.opts.image,
      namespace: this.opts.namespace,
      runFolder: folder,
      gitUrl: this.opts.gitUrl,
      gitRef: this.opts.gitRef,
      hostEnv: this.opts.hostEnv!,
    });
    const created = await this.opts.clients!.batch.createNamespacedJob({
      namespace: this.opts.namespace,
      body: job,
    });
    const jobName = created.metadata?.name;
    if (!jobName) throw new Error('k8s did not return a job name');
    const id = `${task.taskId}::${jobName}`;
    this.state.set(id, { jobName, folder });
    return { id };
  }

  async wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult> {
    const s = this.state.get(h.id);
    if (!s) throw new Error(`unknown handle: ${h.id}`);
    const outcome = await watchJob({
      clients: this.opts.clients!,
      namespace: this.opts.namespace,
      jobName: s.jobName,
      timeoutMs: opts?.timeoutMs ?? 60 * 60_000,
    });
    const reason =
      outcome.status === 'succeeded' ? 'ok' : outcome.status === 'timeout' ? 'timeout' : 'error';
    return { exitCode: outcome.status === 'succeeded' ? 0 : 1, reason };
  }

  async *logs(h: Handle, _opts?: { follow: boolean }): AsyncIterable<string> {
    const s = this.state.get(h.id);
    if (!s) throw new Error(`unknown handle: ${h.id}`);
    // Pod naming: jobName-XXXX. List pods by label, pick first.
    const pods = await this.opts.clients!.core.listNamespacedPod({
      namespace: this.opts.namespace,
      labelSelector: `job-name=${s.jobName}`,
    });
    const pod = pods.items[0];
    if (!pod?.metadata?.name) return;
    const text = await this.opts.clients!.core.readNamespacedPodLog({
      name: pod.metadata.name,
      namespace: this.opts.namespace,
      container: 'worker',
    });
    yield String(text);
  }

  async cancel(h: Handle): Promise<void> {
    const s = this.state.get(h.id);
    if (!s) return;
    await this.opts
      .clients!.batch.deleteNamespacedJob({
        name: s.jobName,
        namespace: this.opts.namespace,
        propagationPolicy: 'Foreground' as never,
      })
      .catch(() => {});
  }
}
```

- [ ] **Step 4: Tests using stubbed clients**

```ts
import { describe, expect, it, vi } from 'vitest';
import { K8sExecutor } from '../K8sExecutor.js';

describe('K8sExecutor', () => {
  it('creates a Job and reports ok when status.succeeded > 0', async () => {
    const clients = {
      batch: {
        createNamespacedJob: vi.fn(async () => ({ metadata: { name: 'arandano-t1-1' } })),
        readNamespacedJob: vi.fn(async () => ({ status: { succeeded: 1 } })),
        deleteNamespacedJob: vi.fn(async () => ({})),
      },
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [] })),
        readNamespacedPodLog: vi.fn(async () => ''),
      },
    } as never;

    const exec = new K8sExecutor({
      image: 'i',
      namespace: 'arandano',
      gitUrl: 'g',
      gitRef: 'main',
      clients,
      hostEnv: {},
      now: () => new Date('2026-05-08T19:30:00Z'),
    });
    const h = await exec.start({
      /* task fixture */
    } as never);
    const r = await exec.wait(h);
    expect(r.exitCode).toBe(0);
    expect(r.reason).toBe('ok');
  });

  it('reports error when status.failed > 0', async () => {
    // mirror with failed: 1
  });
});
```

- [ ] **Step 5: Run tests, commit**

```bash
npm test -- K8sExecutor
git add packages/executors-k8s/
git commit -m "feat(executors-k8s): K8sExecutor backed by @kubernetes/client-node"
```

---
