> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T2-job-spec-builder.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md
> ├── T1-scaffold-arandano-executors-k8s-package.md
> ├── T2-job-spec-builder.md                                           ← you are here
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md
> ├── T4-config-schema-for-executor-backend-k8s.md
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

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
