# arandano Phase 5 — Kubernetes Executor Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — the `Executor` interface, `DockerExecutor` reference, and CLI executor-switch wiring are pinned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second `Executor` implementation that creates Kubernetes Jobs instead of Docker containers. Ship a Helm chart that prepares a namespace with the right RBAC, secret-pull permissions, and a PVC pattern for project workspaces. The CLI gains `executor.backend: k8s` config, and `arandano run` works against a homelab K3s/K8s cluster the same way it works against Docker.

**Architecture:** New `@arandano/executors-k8s` package using `@kubernetes/client-node`. Each task spawns a Kubernetes `Job` with `restartPolicy: Never`, a `PersistentVolumeClaim` for the workspace (or an `emptyDir` populated via an `initContainer` that `git clone`s the repo), and an explicit `serviceAccount` granted by the Helm chart. The driver streams logs via `Pod.log()` follows. Cancellation deletes the Job (cascades to the Pod).

**Tech Stack:** `@kubernetes/client-node` 1.x, Helm 3, kustomize-style overlays for dev/homelab/prod.

**Reference spec:** `arandano-design.md` §18 (`Executor` interface, "K8s executor (Phase 5)"), §24 Phase 5.

**Scope deferrals:**

- Multi-cluster support — out of scope; one cluster per `arandano` invocation.
- Network policy hardening beyond denying egress except to MCP/registries — defer to a follow-up plan.

---

## Phase 1 reality check (2026-05-11)

This phase adds a second `Executor` implementation. The contract is fully nailed down by Phase 1 — implement exactly what's below.

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
- `Handle = { id: string }` — `packages/core/src/types/executor.ts:34-36`.
- `ExitResult` — `packages/core/src/types/executor.ts:27-32`:
  ```ts
  export interface ExitResult {
    exitCode: number;
    reason: 'ok' | 'timeout' | 'rate_limit' | 'error' | 'tdd_violation' | 'quality_violation';
    resultJsonPath?: string;
    journalPath?: string;
  }
  ```
- `TaskRun` — `packages/core/src/types/executor.ts:4-17` — passes the full task context: `taskId`, `taskMdPath`, `rolePath`, `contextPaths`, `cli`, `model`, `tdd`, `quality`, `envPass`, `workdir`, `timeoutMs`, `mcpServers`.
- Reference implementation: `packages/executors-docker/src/DockerExecutor.ts` (entire file). Mirror its `Map<handleId, {containerId, container, folder}>` running-set pattern for K8s pods/jobs.
- Run folder format: `YYYY-MM-DDTHH-MMZ-<taskId>` from `packages/core/src/runs/layout.ts`. K8s artifacts go in the same location.
- Env vars set in `containerSpec.ts` (the env contract the worker driver consumes): `ARANDANO_TASK_ID`, `ARANDANO_TASK_MD`, `ARANDANO_ROLE_MD`, `ARANDANO_CLI`, `ARANDANO_MODEL`, `ARANDANO_TDD`, `ARANDANO_RUN_FOLDER`, `ARANDANO_QUALITY_JSON`, `ARANDANO_CONTEXT_PATHS` + `task.envPass`. K8s Job spec must inject these as `env:` entries (or via `envFrom: secretRef`).
- Reference `package.json` for new executor packages — `packages/executors-docker/package.json` is the template (deps: `@arandano/core`, `dockerode`; devDeps: `tsup`, `typescript`, `vitest`, `@types/node`).
- CLI command pattern — `packages/cli/src/commands/run.ts:22-23` currently hardcodes Docker:
  ```ts
  const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });
  ```
  Task 5 replaces this with a `pickExecutor(cfg)` switch.
- CLI exit-code idiom: `process.exit(code)`, not `this.exit(code)`.

**Per-task corrections:**

- **Task 1** (scaffold `executors-k8s` package): mirror `packages/executors-docker/package.json` **exactly** for scripts/devDeps. Use `"@arandano/core": "*"` (workspace dep), not `"0.0.0"` — the plan's example `"@arandano/core": "0.0.0"` works today but breaks once core is versioned independently. Check what `executors-docker` actually uses and copy that.
- **Task 3** (`K8sExecutor` wiring): cite `DockerExecutor.ts` as the reference. `Handle.id` should be unique per task (DockerExecutor uses `${taskId}::${container.id}`); for K8s use `${taskId}::${jobName}`. Use a `Map<string, {jobName: string, namespace: string, folder: string}>` running-set.
- **Task 3** (logs/cancel): `logs()` returns `AsyncIterable<string>`; convert k8s pod log streams to string chunks. `cancel()` should `deleteJob(name, { propagationPolicy: 'Foreground' })` so child pods are reaped.
- **Task 5** (CLI selects executor): the exact line being replaced is `run.ts:22`. After the refactor:
  ```ts
  const executor = pickExecutor(cfg, projectRoot); // returns DockerExecutor or K8sExecutor based on cfg.executor.backend
  ```
  Put `pickExecutor` in `packages/cli/src/lib/pickExecutor.ts` (new file) so Phase 2's plan dispatcher (`run --plan`) can share it.
- **Task 4** (config schema): the existing config schema lives in `packages/core/src/types/config.ts`. Add a `KubernetesExecutorConfig` union member; don't replace the existing `DockerExecutorConfig`. Validate via Zod in `packages/core/src/config/load.ts`.
- **Sequencing**: Phase 5 Task 5 (CLI executor switch) overlaps with Phase 2 Task 6 (`--plan` flag in `run.ts`). Whichever phase ships first owns the `pickExecutor` extraction; the other phase consumes it.

---

## File Structure

```
arandano/
├── packages/executors-k8s/                  new package
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── K8sExecutor.ts
│   │   ├── jobSpec.ts                       pure builder
│   │   ├── client.ts                        @kubernetes/client-node factory
│   │   ├── watchJob.ts                      poll/watch helper
│   │   └── __tests__/{jobSpec,K8sExecutor}.test.ts
├── packages/cli/src/commands/run.ts         modify: pick executor by backend
├── packages/core/src/config/load.ts         modify: validate k8s config block
└── packages/core/src/types/config.ts        modify: K8sExecutorConfig

charts/
└── arandano/                                Helm chart for the homelab
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── namespace.yaml
        ├── serviceaccount.yaml
        ├── role.yaml
        ├── rolebinding.yaml
        └── secret.yaml                      registry pull secret (template)
```

---

### Task 1: Scaffold `@arandano/executors-k8s` package

**Goal:** New workspace package with the same shape as `executors-docker` (build, test, typecheck) and one passing smoke test.

**Files:**

- Create: `packages/executors-k8s/{package.json,tsconfig.json,tsup.config.ts}`
- Create: `packages/executors-k8s/src/index.ts`
- Create: `packages/executors-k8s/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Author `packages/executors-k8s/package.json`**

```json
{
  "name": "@arandano/executors-k8s",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0",
    "@kubernetes/client-node": "^1.0.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` and `tsup.config.ts`** — mirror `executors-docker`.

- [ ] **Step 3: `src/index.ts`**

```ts
export { K8sExecutor } from './K8sExecutor.js';
```

- [ ] **Step 4: Smoke test**

```ts
// __tests__/smoke.test.ts
import { describe, expect, it } from 'vitest';
import * as mod from '../index.js';
describe('@arandano/executors-k8s', () => {
  it('exports K8sExecutor', () => {
    expect(typeof mod.K8sExecutor).toBe('function');
  });
});
```

- [ ] **Step 5: Install, build, commit**

```bash
npm install
npm run build
npm test -- executors-k8s
git add packages/executors-k8s/ package-lock.json
git commit -m "feat: scaffold @arandano/executors-k8s package"
```

---

### Task 2: Job spec builder (TDD)

**Goal:** Pure function turning a `TaskRun` + project context into a `V1Job` resource. Tested without any cluster.

**Files:**

- Create: `packages/executors-k8s/src/jobSpec.ts`
- Create: `packages/executors-k8s/src/__tests__/jobSpec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/jobSpec.test.ts
import { describe, expect, it } from 'vitest';
import { buildJobSpec } from '../jobSpec.js';
import type { TaskRun } from '@arandano/core';

const task = (over: Partial<TaskRun> = {}): TaskRun => ({
  taskId: 'T1',
  taskMdPath: 'p.md',
  rolePath: 'r.md',
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
    security: 'required',
    commit_msg: 'conventional',
    reviewer_required: false,
  },
  envPass: ['GH_TOKEN', 'ANTHROPIC_API_KEY'],
  workdir: '/workspace',
  timeoutMs: 45 * 60_000,
  mcpServers: [],
  ...over,
});

describe('buildJobSpec', () => {
  it('produces a valid Job with one container', () => {
    const j = buildJobSpec({
      task: task(),
      image: 'ghcr.io/x/arandano-worker:1.0.0',
      namespace: 'arandano',
      runFolder: '2026-05-08T19-30Z-T1',
      gitUrl: 'git@github.com:me/repo.git',
      gitRef: 'main',
      hostEnv: { GH_TOKEN: 'a', ANTHROPIC_API_KEY: 'b' },
    });
    expect(j.kind).toBe('Job');
    expect(j.metadata?.namespace).toBe('arandano');
    expect(j.metadata?.name).toMatch(/^arandano-T1-/);
    expect(j.spec?.template.spec?.containers[0]?.image).toBe('ghcr.io/x/arandano-worker:1.0.0');
    expect(j.spec?.template.spec?.restartPolicy).toBe('Never');
  });

  it('includes an init container that clones the repo', () => {
    const j = buildJobSpec({
      task: task(),
      image: 'i',
      namespace: 'a',
      runFolder: 'f',
      gitUrl: 'git@github.com:me/repo.git',
      gitRef: 'main',
      hostEnv: {},
    });
    const init = j.spec?.template.spec?.initContainers?.[0];
    expect(init).toBeDefined();
    expect(init?.command?.join(' ')).toContain('git clone');
  });

  it('forwards ARANDANO_* and listed envPass env vars (when present in hostEnv)', () => {
    const j = buildJobSpec({
      task: task(),
      image: 'i',
      namespace: 'a',
      runFolder: 'rf',
      gitUrl: 'g',
      gitRef: 'main',
      hostEnv: { GH_TOKEN: 'tok' },
    });
    const env = j.spec?.template.spec?.containers[0]?.env ?? [];
    const names = env.map((e) => e.name);
    expect(names).toContain('ARANDANO_TASK_ID');
    expect(names).toContain('GH_TOKEN');
    expect(names).not.toContain('ANTHROPIC_API_KEY'); // not in hostEnv
  });

  it('sets activeDeadlineSeconds from timeoutMs', () => {
    const j = buildJobSpec({
      task: task({ timeoutMs: 60_000 }),
      image: 'i',
      namespace: 'a',
      runFolder: 'rf',
      gitUrl: 'g',
      gitRef: 'main',
      hostEnv: {},
    });
    expect(j.spec?.activeDeadlineSeconds).toBe(60);
  });
});
```

- [ ] **Step 2: Implement `jobSpec.ts`**

```ts
import type { V1Job } from '@kubernetes/client-node';
import type { TaskRun } from '@arandano/core';

export interface BuildJobSpecOpts {
  task: TaskRun;
  image: string;
  namespace: string;
  runFolder: string;
  gitUrl: string;
  gitRef: string;
  hostEnv: Record<string, string | undefined>;
}

export function buildJobSpec(o: BuildJobSpecOpts): V1Job {
  const env = [
    { name: 'ARANDANO_TASK_ID', value: o.task.taskId },
    { name: 'ARANDANO_TASK_MD', value: o.task.taskMdPath },
    { name: 'ARANDANO_ROLE_MD', value: o.task.rolePath },
    { name: 'ARANDANO_CLI', value: o.task.cli },
    { name: 'ARANDANO_MODEL', value: o.task.model },
    { name: 'ARANDANO_TDD', value: o.task.tdd },
    { name: 'ARANDANO_RUN_FOLDER', value: o.runFolder },
    { name: 'ARANDANO_QUALITY_JSON', value: JSON.stringify(o.task.quality) },
  ];
  for (const k of o.task.envPass) {
    const v = o.hostEnv[k];
    if (typeof v === 'string' && v.length > 0) env.push({ name: k, value: v });
  }

  const cleanId = o.task.taskId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const name = `arandano-${cleanId}-${Date.now()}`.slice(0, 63);

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: o.namespace, labels: { 'arandano.io/task-id': o.task.taskId } },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: Math.ceil(o.task.timeoutMs / 1000),
      template: {
        metadata: { labels: { 'arandano.io/task-id': o.task.taskId } },
        spec: {
          serviceAccountName: 'arandano-worker',
          restartPolicy: 'Never',
          initContainers: [
            {
              name: 'clone',
              image: 'alpine/git:latest',
              command: [
                'sh',
                '-c',
                `git clone --depth=10 --branch ${o.gitRef} ${o.gitUrl} /workspace`,
              ],
              volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            },
          ],
          containers: [
            {
              name: 'worker',
              image: o.image,
              workingDir: o.task.workdir,
              env,
              volumeMounts: [{ name: 'workspace', mountPath: o.task.workdir }],
              securityContext: { runAsNonRoot: true, runAsUser: 1000 },
            },
          ],
          volumes: [{ name: 'workspace', emptyDir: { sizeLimit: '2Gi' } }],
        },
      },
    },
  };
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- jobSpec
git add packages/executors-k8s/
git commit -m "feat(executors-k8s): pure Job spec builder"
```

---

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

### Task 4: Config schema for `executor.backend: k8s`

**Goal:** Extend `ProjectConfig` and the loader so a `k8s:` block validates with `namespace`, `kubeconfig_path?`, `context?`, `git_url`, `git_ref`, `image`.

**Files:**

- Modify: `packages/core/src/types/config.ts`
- Modify: `packages/core/src/config/load.ts`
- Modify: `packages/core/src/__tests__/config.test.ts`

- [ ] **Step 1: Add `K8sExecutorConfig`**

```ts
export interface K8sExecutorConfig {
  namespace: string;
  kubeconfig_path?: string;
  context?: string;
  image: string;
  git_url: string;
  git_ref: string;
  workdir: string;
  env_pass: string[];
}

export interface ExecutorConfig {
  backend: ExecutorBackend;
  docker?: DockerExecutorConfig;
  k8s?: K8sExecutorConfig;
}
```

- [ ] **Step 2: Add the schema in `load.ts`**

```ts
const K8sExecutorSchema = z.object({
  namespace: z.string().min(1),
  kubeconfig_path: z.string().optional(),
  context: z.string().optional(),
  image: z.string().min(1),
  git_url: z.string().min(1),
  git_ref: z.string().min(1),
  workdir: z.string().min(1),
  env_pass: z.array(z.string()),
});

const ExecutorSchema = z.object({
  backend: z.enum(['docker', 'k8s', 'local']),
  docker: DockerExecutorSchema.optional(),
  k8s: K8sExecutorSchema.optional(),
});
```

- [ ] **Step 3: Add a test**

```ts
it('parses an executor.backend=k8s config', () => {
  const yaml = validYaml.replace(
    /^executor:[\s\S]*?\n(?=git:)/m,
    `executor:
  backend: k8s
  k8s:
    namespace: arandano
    image: ghcr.io/x/y:1
    git_url: git@github.com:me/repo.git
    git_ref: main
    workdir: /workspace
    env_pass: [GH_TOKEN]
`,
  );
  const cfg = loadConfig(yaml);
  expect(cfg.executor.backend).toBe('k8s');
  expect(cfg.executor.k8s?.namespace).toBe('arandano');
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test
git add packages/core/
git commit -m "feat(core): config schema for executor.backend=k8s"
```

---

### Task 5: CLI selects executor by backend

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/package.json` — add dependency on `@arandano/executors-k8s`

- [ ] **Step 1: Update `run.ts`**

```ts
import { DockerExecutor } from '@arandano/executors-docker';
import { K8sExecutor } from '@arandano/executors-k8s';
// ...

const cfg = loadConfig(await readFile(...));
let executor: Executor;
if (cfg.executor.backend === 'docker') {
  executor = new DockerExecutor({ image: cfg.executor.docker!.image, host: cfg.executor.docker!.host, projectRoot });
} else if (cfg.executor.backend === 'k8s') {
  const k = cfg.executor.k8s!;
  executor = new K8sExecutor({
    image: k.image, namespace: k.namespace, gitUrl: k.git_url, gitRef: k.git_ref,
  });
} else {
  throw new Error(`backend ${cfg.executor.backend} not supported`);
}
```

- [ ] **Step 2: Add cli dependency, run tests, commit**

```bash
npm install @arandano/executors-k8s -w packages/cli
npm test
git add packages/cli/ package-lock.json
git commit -m "feat(cli): select K8sExecutor when backend=k8s"
```

---

### Task 6: Helm chart for the homelab cluster

**Goal:** A chart that, when installed, prepares the `arandano` namespace, ServiceAccount, RBAC, and an image-pull secret template.

**Files:**

- Create: `charts/arandano/Chart.yaml`
- Create: `charts/arandano/values.yaml`
- Create: `charts/arandano/templates/{namespace,serviceaccount,role,rolebinding,secret}.yaml`

- [ ] **Step 1: `Chart.yaml`**

```yaml
apiVersion: v2
name: arandano
description: Namespace + RBAC for arandano workers
type: application
version: 0.1.0
appVersion: '0.1.0'
```

- [ ] **Step 2: `values.yaml`**

```yaml
namespace: arandano
serviceAccount:
  name: arandano-worker
imagePullSecret:
  enabled: true
  name: ghcr-pull
  dockerConfigJson: '' # base64-encoded; user supplies via --set or a Sealed Secret
```

- [ ] **Step 3: `templates/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: { { .Values.namespace } }
```

- [ ] **Step 4: `templates/serviceaccount.yaml`**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceAccount.name }}
  namespace: {{ .Values.namespace }}
{{- if .Values.imagePullSecret.enabled }}
imagePullSecrets:
  - name: {{ .Values.imagePullSecret.name }}
{{- end }}
```

- [ ] **Step 5: `templates/role.yaml`**

The worker only needs to read its own pod (for self-introspection in logs). The orchestrator creates Jobs from outside the cluster, so the worker SA stays minimal.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: arandano-worker
  namespace: { { .Values.namespace } }
rules:
  - apiGroups: ['']
    resources: ['pods']
    verbs: ['get', 'list', 'watch']
```

- [ ] **Step 6: `templates/rolebinding.yaml`**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: arandano-worker
  namespace: { { .Values.namespace } }
subjects:
  - kind: ServiceAccount
    name: { { .Values.serviceAccount.name } }
    namespace: { { .Values.namespace } }
roleRef:
  kind: Role
  name: arandano-worker
  apiGroup: rbac.authorization.k8s.io
```

- [ ] **Step 7: `templates/secret.yaml`**

```yaml
{{- if and .Values.imagePullSecret.enabled .Values.imagePullSecret.dockerConfigJson }}
apiVersion: v1
kind: Secret
type: kubernetes.io/dockerconfigjson
metadata:
  name: {{ .Values.imagePullSecret.name }}
  namespace: {{ .Values.namespace }}
data:
  .dockerconfigjson: {{ .Values.imagePullSecret.dockerConfigJson }}
{{- end }}
```

- [ ] **Step 8: Lint and dry-render**

```bash
helm lint charts/arandano
helm template arandano charts/arandano > /tmp/render.yaml
```

Expected: clean lint; rendered yaml is valid kubernetes manifests.

- [ ] **Step 9: Document install**

Append to `docs/setup-guide.md`:

````markdown
## Optional — install on Kubernetes

If you'd rather run workers as K8s Jobs (e.g., on a homelab K3s cluster):

1. Set `executor.backend: k8s` in `.arandano/config.yaml` and add a `k8s:` block.
2. Install the chart on your cluster:

```bash
helm upgrade --install arandano ./charts/arandano \
  --create-namespace --namespace arandano \
  --set imagePullSecret.dockerConfigJson="$(cat ~/.docker/config.json | base64 -w0)"
```
````

3. Make sure your laptop's `kubectl` context points at that cluster (`kubectl config use-context homelab`).
4. Run `arandano doctor` — it will exercise the cluster connection.

````

- [ ] **Step 10: Commit**

```bash
git add charts/ docs/setup-guide.md
git commit -m "feat: helm chart for arandano namespace + RBAC"
````

---

### Task 7: Doctor extension for k8s

**Goal:** When `backend=k8s`, `arandano doctor` validates the cluster connection, the namespace exists, and the SA is present.

**Files:**

- Modify: `packages/cli/src/commands/doctor.ts`

- [ ] **Step 1: Add a k8s branch**

```ts
if (cfg.executor.backend === 'k8s') {
  const k = cfg.executor.k8s!;
  checks.push(
    await tryCheck('k8s context reachable', async () => {
      const { defaultClients } = await import('@arandano/executors-k8s');
      const clients = defaultClients({ kubeconfigPath: k.kubeconfig_path, context: k.context });
      await clients.core.readNamespace({ name: k.namespace });
    }),
  );
  checks.push(
    await tryCheck('k8s SA arandano-worker present', async () => {
      const { defaultClients } = await import('@arandano/executors-k8s');
      const clients = defaultClients({ kubeconfigPath: k.kubeconfig_path, context: k.context });
      await clients.core.readNamespacedServiceAccount({
        name: 'arandano-worker',
        namespace: k.namespace,
      });
    }),
  );
}
```

(Re-export `defaultClients` from `@arandano/executors-k8s` index.)

- [ ] **Step 2: Run, commit**

```bash
git add packages/executors-k8s/src/index.ts packages/cli/
git commit -m "feat(cli): doctor verifies k8s namespace and service account"
```

---

### Task 8: End-to-end verification on a real cluster

**Goal:** On a K3s cluster (homelab), install the chart and run a task.

- [ ] **Step 1: Stand up K3s on the homelab (skip if already there)**

```bash
ssh homelab 'curl -sfL https://get.k3s.io | sh -'
ssh homelab 'sudo cat /etc/rancher/k3s/k3s.yaml' > ~/.kube/homelab
# update server: line in that file to homelab.local:6443
export KUBECONFIG=~/.kube/homelab
kubectl get nodes
```

- [ ] **Step 2: Install the chart**

```bash
helm upgrade --install arandano ./charts/arandano --create-namespace -n arandano \
  --set imagePullSecret.dockerConfigJson="$(cat ~/.docker/config.json | base64 -w0)"
```

- [ ] **Step 3: Switch the toy to `backend: k8s`**

In `arandano-examples/node-ts-toy/.arandano/config.yaml`:

```yaml
executor:
  backend: k8s
  k8s:
    namespace: arandano
    image: ghcr.io/nmunozsi/arandano-worker:latest
    git_url: git@github.com:nmunozsi/arandano-examples-node-ts-toy.git
    git_ref: main
    workdir: /workspace
    env_pass: [GH_TOKEN, ANTHROPIC_API_KEY]
```

- [ ] **Step 4: Run a task**

```bash
arandano run T1
```

Watch:

```bash
kubectl -n arandano get jobs -w
kubectl -n arandano logs -l arandano.io/task-id=T1 -f
```

Expected: Job runs to completion; PR opens.

- [ ] **Step 5: Document**

Append to `arandano-examples/README.md` a "K8s execution" section linking to the PR opened by the K8s-dispatched run.

---

## Phase 5 done — exit criteria

- [ ] `executor.backend: k8s` is fully wired through CLI → core → executor
- [ ] `K8sExecutor` creates Jobs that complete and emit logs and PRs identically to the Docker executor
- [ ] Helm chart installs cleanly on a fresh K3s cluster
- [ ] `arandano doctor` validates k8s connectivity when `backend=k8s`
- [ ] At least one end-to-end task is dispatched on a real cluster and lands a PR

After this, the next plan covers **Phase 6 — daemon mode (HTTP API + SQLite state)**.
