> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T5-container-spec-builder.md`
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
> ├── T5-container-spec-builder.md                                       ← you are here
> ├── T6-dockerexecutor-wiring.md
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

### Task 5: Container spec builder (TDD)

**Goal:** Pure function that turns a `TaskRun` + project paths into the docker run parameters dockerode needs (image, env, mounts, cmd). Keep it pure so we can test without Docker.

**Files:**

- Create: `packages/executors-docker/src/containerSpec.ts`
- Create: `packages/executors-docker/src/__tests__/containerSpec.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/executors-docker/src/__tests__/containerSpec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildContainerSpec } from '../containerSpec.js';
import type { TaskRun } from '@arandano/core';

const baseTask = (over: Partial<TaskRun> = {}): TaskRun => ({
  taskId: 'T1',
  taskMdPath: '.arandano/tasks/p/T1-foo.md',
  rolePath: '.arandano/roles/coder.md',
  contextPaths: ['src/CONTEXT.md', 'planning/memory/coding-standards.md'],
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
  envPass: ['GH_TOKEN', 'ANTHROPIC_API_KEY'],
  workdir: '/workspace',
  timeoutMs: 45 * 60_000,
  mcpServers: [],
  ...over,
});

describe('buildContainerSpec', () => {
  it('mounts the project root at the workdir', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'ghcr.io/nmunozsi/arandano-worker:1.0.0',
      projectRoot: '/abs/repo',
      runFolder: '2026-05-08T19-30Z-T1',
      hostEnv: { GH_TOKEN: 'abc', ANTHROPIC_API_KEY: 'def' },
    });
    expect(spec.HostConfig.Binds).toContain('/abs/repo:/workspace');
  });

  it('passes env vars listed in envPass when present in hostEnv', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: { GH_TOKEN: 'abc' },
    });
    expect(spec.Env).toContain('GH_TOKEN=abc');
    expect(spec.Env?.find((e) => e.startsWith('ANTHROPIC_API_KEY='))).toBeUndefined();
  });

  it('passes ARANDANO_* env so the worker knows what to do', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: '2026-05-08T19-30Z-T1',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_TASK_ID=T1');
    expect(spec.Env).toContain('ARANDANO_TASK_MD=.arandano/tasks/p/T1-foo.md');
    expect(spec.Env).toContain('ARANDANO_ROLE_MD=.arandano/roles/coder.md');
    expect(spec.Env).toContain('ARANDANO_CLI=claude-code');
    expect(spec.Env).toContain('ARANDANO_MODEL=claude-sonnet-4-6');
    expect(spec.Env).toContain('ARANDANO_TDD=strict');
    expect(spec.Env).toContain('ARANDANO_RUN_FOLDER=2026-05-08T19-30Z-T1');
  });

  it('runs as a non-root user', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.User).toBeDefined();
    expect(spec.User).not.toBe('root');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npm test -- containerSpec
```

- [x] **Step 3: Implement `packages/executors-docker/src/containerSpec.ts`**

```ts
import type { TaskRun } from '@arandano/core';

export interface BuildContainerSpecOpts {
  task: TaskRun;
  image: string;
  projectRoot: string;
  runFolder: string;
  hostEnv: Record<string, string | undefined>;
}

export interface ContainerSpec {
  Image: string;
  WorkingDir: string;
  User: string;
  Env: string[];
  HostConfig: { Binds: string[]; AutoRemove: boolean };
}

export function buildContainerSpec(opts: BuildContainerSpecOpts): ContainerSpec {
  const { task, image, projectRoot, runFolder, hostEnv } = opts;

  const env: string[] = [
    `ARANDANO_TASK_ID=${task.taskId}`,
    `ARANDANO_TASK_MD=${task.taskMdPath}`,
    `ARANDANO_ROLE_MD=${task.rolePath}`,
    `ARANDANO_CLI=${task.cli}`,
    `ARANDANO_MODEL=${task.model}`,
    `ARANDANO_TDD=${task.tdd}`,
    `ARANDANO_RUN_FOLDER=${runFolder}`,
    `ARANDANO_QUALITY_JSON=${JSON.stringify(task.quality)}`,
    `ARANDANO_CONTEXT_PATHS=${task.contextPaths.join(',')}`,
  ];

  for (const key of task.envPass) {
    const v = hostEnv[key];
    if (typeof v === 'string' && v.length > 0) env.push(`${key}=${v}`);
  }

  return {
    Image: image,
    WorkingDir: task.workdir,
    User: '1000:1000',
    Env: env,
    HostConfig: {
      Binds: [`${projectRoot}:${task.workdir}`],
      AutoRemove: false,
    },
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npm test -- containerSpec
```

- [x] **Step 5: Commit**

```bash
git add packages/executors-docker/src/containerSpec.ts packages/executors-docker/src/__tests__/containerSpec.test.ts
git commit -m "feat(executors-docker): pure container spec builder"
```

---
