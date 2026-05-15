> **Location:** `docs/perf-instrumentation/plans/instrumentation/T7-improvement-a-npm-cache-volume.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md
> ├── T4-arandano-bench-cli-command.md
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md                              ← you are here
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 7: Improvement A — npm cache volume (tentative)

**Note:** This task is conditional on T6's decision. If T6 dropped or replaced A, swap this whole task for the agreed alternative; the rest of the structure (code → re-run → record delta) is the same. Below assumes A was confirmed.

**Goal:** Mount a Docker named volume at the worker's npm cache directory so `npm install` reuses downloaded packages across runs.

**Files:**

- Modify: `packages/executors-docker/src/containerSpec.ts`
- Modify: `packages/executors-docker/src/__tests__/containerSpec.test.ts` (if present — else create one quick assertion)

- [ ] **Step 1: Inspect the worker image's npm cache location**

The worker image runs as uid 1001 (`worker` user). The default npm cache is `~/.npm`, which inside the container is `/home/worker/.npm` (the worker Dockerfile sets `HOME=/home/worker`).

- [ ] **Step 2: Add the named-volume bind to `containerSpec.ts`**

Edit the `HostConfig.Binds` in `packages/executors-docker/src/containerSpec.ts`:

```ts
return {
  Image: image,
  WorkingDir: task.workdir,
  User: '1001:1001',
  Env: env,
  HostConfig: {
    Binds: [`${projectRoot}:${task.workdir}`, `arandano-npm-cache:/home/worker/.npm`],
    AutoRemove: false,
  },
};
```

The Docker daemon auto-creates the `arandano-npm-cache` named volume on first use.

- [ ] **Step 3: Update / add a test**

Find or create `packages/executors-docker/src/__tests__/containerSpec.test.ts` and assert the binds include the named volume:

```ts
import { describe, expect, it } from 'vitest';
import { buildContainerSpec } from '../containerSpec.js';
import type { TaskRun } from '@arandano/core';

const task: TaskRun = {
  taskId: 'T1',
  taskMdPath: 'p',
  rolePath: 'r',
  contextPaths: [],
  cli: 'claude',
  model: 'm',
  tdd: 'relaxed',
  quality: {} as never,
  envPass: [],
  workdir: '/workspace',
  timeoutMs: 1,
  mcpServers: [],
};

describe('containerSpec', () => {
  it('mounts the npm cache volume', () => {
    const s = buildContainerSpec({
      task,
      image: 'img',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(s.HostConfig.Binds).toContain('arandano-npm-cache:/home/worker/.npm');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -w packages/executors-docker
```

Expected: green.

- [ ] **Step 5: Rebuild the CLI**

```bash
npm run build
```

- [ ] **Step 6: Re-measure — run the plan again with caches warmed**

Reset the toy state (keep T1, remove T4/T5/T6) as in Task 5 Step 1, then run the plan:

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=2026-05-11-three-helpers
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench --task T4 --last 2
```

The first run after the volume is created will still be cold (cache is empty). Run the plan **a second time** (reset state again) to measure the actually-warmed cache effect. Compare the second post-change row against the baseline row.

- [ ] **Step 7: Record the delta**

In `docs/plans/2026-05-14-phase-3-performance.md`, add a row to a (newly created if needed) "Results" section at the bottom:

```markdown
## Results

| Improvement          | Δ worker_install_ms | Δ total_ms | Notes                                  |
| -------------------- | ------------------- | ---------- | -------------------------------------- |
| A — npm cache volume | -X%                 | -Y%        | warmed cache; cold first run unchanged |
```

- [ ] **Step 8: Commit**

```bash
git add packages/executors-docker/src/containerSpec.ts packages/executors-docker/src/__tests__/containerSpec.test.ts docs/plans/2026-05-14-phase-3-performance.md
git commit -m "perf(executors-docker): mount named npm cache volume (~X% install speedup)"
```

(Fill in the real % from Step 7.)

---
