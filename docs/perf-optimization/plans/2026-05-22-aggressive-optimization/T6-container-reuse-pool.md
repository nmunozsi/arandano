> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T6-container-reuse-pool.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md
> ├── T1-instrumentation-foundation.md
> ├── T2-parallelize-gates.md
> ├── T3-context-injection-and-tool-trim.md
> ├── T4-inline-role-and-standards.md
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md                       ← you are here
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 6: Container reuse with configurable warm pool

**Goal:** Skip `git clone`, `docker pull`, `docker create`, container start, and entrypoint init for tasks 2+ in a plan by reusing warm containers. Each pool slot owns a persistent workspace (so parallel-task isolation is preserved). Configurable via `executor.warm_pool_size` (default 0 = disabled) and `--warm-pool=N`.

**Design:**

- `WarmContainerPool` keyed by `(image)` with N slots. Each slot has its own persistent workspace at `<tmpdir>/arandano-pool/<imageHash>/slot-<N>/`.
- On first acquire for a slot: clone projectRoot → slot workspace, create container with bind to slot workspace, start container, return `{containerId, workdir, isWarm: false}`.
- On release: exec a reset script inside the container (`git merge --abort 2>/dev/null || true; git reset --hard HEAD; git clean -fdx -e node_modules`). On success, slot is marked free. On reset failure, destroy container + workdir; slot becomes empty.
- Subsequent acquire on a free warm slot returns `{containerId, workdir, isWarm: true}`.
- On CLI exit: stop all warm containers, optionally keep workdirs for next run.

**Files:**

- New: `packages/executors-docker/src/warmContainerPool.ts`
- New: `packages/executors-docker/src/__tests__/warmContainerPool.test.ts`
- Modify: `packages/executors-docker/src/DockerExecutor.ts` — pool integration; emit `host_container_reuse` 0/1.
- Modify: `packages/templates/assets/config.yaml.tpl` — `executor.warm_pool_size: 0`.
- Modify: `packages/cli/src/commands/run.ts` — `--warm-pool=<N>` flag.
- Modify: `packages/core/src/orchestrator/runOne.ts` — pass pool size through.

---

### Step 1 — Failing test for `WarmContainerPool.acquire/release` semantics

- [x] **Step 1: Create `packages/executors-docker/src/__tests__/warmContainerPool.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { WarmContainerPool } from '../warmContainerPool.js';

const makeFakeClient = () => {
  const containers: { id: string; running: boolean }[] = [];
  let counter = 0;
  return {
    pull: vi.fn().mockResolvedValue(undefined),
    createContainer: vi.fn(async () => {
      counter++;
      const c = { id: `c${counter}`, running: true };
      containers.push(c);
      return {
        id: c.id,
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(async () => {
          c.running = false;
        }),
        remove: vi.fn(async () => {
          containers.splice(containers.indexOf(c), 1);
        }),
        exec: vi.fn(async () => ({
          start: vi.fn(),
          inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
        })),
      };
    }),
    containers: () => containers,
  };
};

describe('WarmContainerPool', () => {
  it('first acquire is cold; release returns slot; second acquire on same image is warm', async () => {
    const client = makeFakeClient();
    const cloneProject = vi.fn(async (src: string, dst: string) => {
      void src;
      void dst;
    });
    const pool = new WarmContainerPool({
      client: client as unknown as any,
      cloneProject,
      poolDir: '/tmp/arandano-pool-test',
      maxSlots: 2,
    });

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(a.isWarm).toBe(false);
    expect(client.createContainer).toHaveBeenCalledTimes(1);
    await pool.release({ slotId: a.slotId, resetOk: true });

    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(b.isWarm).toBe(true);
    expect(b.containerId).toBe(a.containerId);
    expect(client.createContainer).toHaveBeenCalledTimes(1); // not recreated
  });

  it('reset failure destroys the container and next acquire is cold', async () => {
    const client = makeFakeClient();
    const cloneProject = vi.fn(async () => {});
    const pool = new WarmContainerPool({
      client: client as unknown as any,
      cloneProject,
      poolDir: '/tmp/arandano-pool-test2',
      maxSlots: 2,
    });

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    await pool.release({ slotId: a.slotId, resetOk: false });
    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(b.isWarm).toBe(false);
    expect(b.containerId).not.toBe(a.containerId);
  });

  it('maxSlots caps the pool; surplus acquires create+destroy without warming', async () => {
    const client = makeFakeClient();
    const cloneProject = vi.fn(async () => {});
    const pool = new WarmContainerPool({
      client: client as unknown as any,
      cloneProject,
      poolDir: '/tmp/arandano-pool-test3',
      maxSlots: 1,
    });

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    // b had no slot available; pool returns isWarm=false with a transient container that won't be retained
    expect(b.isWarm).toBe(false);
    await pool.release({ slotId: a.slotId, resetOk: true });
    await pool.release({ slotId: b.slotId, resetOk: true });
    // slot is freed; transient container destroyed
  });
});
```

- [x] **Step 2: Run — expect FAIL (class doesn't exist)**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npx vitest run packages/executors-docker/src/__tests__/warmContainerPool.test.ts
```

### Step 3 — Implement `WarmContainerPool`

- [x] **Step 3: Create `packages/executors-docker/src/warmContainerPool.ts`**

```ts
import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DockerClient } from './client.js';
import type { ContainerSpec } from './containerSpec.js';

export type CloneProjectFn = (src: string, dst: string, remoteUrl: string) => Promise<void>;

export interface PoolAcquireOpts {
  image: string;
  projectRoot: string;
  remoteUrl?: string;
  buildSpec: (workdir: string) => ContainerSpec;
}

export interface PoolAcquireResult {
  slotId: string;
  containerId: string;
  container: Awaited<ReturnType<DockerClient['createContainer']>>;
  workdir: string;
  isWarm: boolean;
}

interface Slot {
  id: string;
  image: string;
  workdir: string;
  container: PoolAcquireResult['container'];
  inUse: boolean;
  transient: boolean; // true when pool is full at acquire-time; destroyed on release
}

export interface WarmContainerPoolOpts {
  client: DockerClient;
  cloneProject: CloneProjectFn;
  poolDir?: string;
  maxSlots: number;
}

const imageHash = (image: string): string =>
  createHash('sha1').update(image).digest('hex').slice(0, 12);

export class WarmContainerPool {
  private readonly slots = new Map<string, Slot>();
  private slotCounter = 0;
  private readonly opts: Required<Omit<WarmContainerPoolOpts, 'poolDir'>> & { poolDir: string };

  constructor(opts: WarmContainerPoolOpts) {
    this.opts = {
      client: opts.client,
      cloneProject: opts.cloneProject,
      maxSlots: opts.maxSlots,
      poolDir: opts.poolDir ?? join(tmpdir(), 'arandano-pool'),
    };
  }

  async acquire(opts: PoolAcquireOpts): Promise<PoolAcquireResult> {
    // 1. Try to find a warm idle slot for the same image.
    for (const slot of this.slots.values()) {
      if (!slot.inUse && slot.image === opts.image) {
        slot.inUse = true;
        return {
          slotId: slot.id,
          containerId: slot.container.id,
          container: slot.container,
          workdir: slot.workdir,
          isWarm: true,
        };
      }
    }
    // 2. No warm slot; check if we have capacity to create a new persistent slot.
    const sameImageCount = [...this.slots.values()].filter(
      (s) => s.image === opts.image && !s.transient,
    ).length;
    const transient = sameImageCount >= this.opts.maxSlots;

    this.slotCounter++;
    const slotIdx = this.slotCounter;
    const slotId = `slot-${imageHash(opts.image)}-${slotIdx}`;
    const workdir = join(this.opts.poolDir, imageHash(opts.image), `slot-${slotIdx}`);
    await mkdir(workdir, { recursive: true });
    await this.opts.cloneProject(opts.projectRoot, workdir, opts.remoteUrl ?? '');

    const spec = opts.buildSpec(workdir);
    await this.opts.client.pull(opts.image);
    const container = await this.opts.client.createContainer(spec as unknown);
    await container.start();

    const slot: Slot = {
      id: slotId,
      image: opts.image,
      workdir,
      container,
      inUse: true,
      transient,
    };
    this.slots.set(slotId, slot);

    return {
      slotId,
      containerId: container.id,
      container,
      workdir,
      isWarm: false,
    };
  }

  async release(args: { slotId: string; resetOk: boolean }): Promise<void> {
    const slot = this.slots.get(args.slotId);
    if (!slot) return;
    if (slot.transient || !args.resetOk) {
      // Destroy.
      await slot.container.stop({ t: 5 }).catch(() => {});
      await slot.container.remove({ force: true }).catch(() => {});
      await rm(slot.workdir, { recursive: true, force: true }).catch(() => {});
      this.slots.delete(args.slotId);
      return;
    }
    slot.inUse = false;
  }

  async shutdown(): Promise<void> {
    for (const slot of this.slots.values()) {
      await slot.container.stop({ t: 5 }).catch(() => {});
      await slot.container.remove({ force: true }).catch(() => {});
      await rm(slot.workdir, { recursive: true, force: true }).catch(() => {});
    }
    this.slots.clear();
  }
}
```

- [x] **Step 4: Re-run pool tests — expect PASS**

```powershell
npx vitest run packages/executors-docker/src/__tests__/warmContainerPool.test.ts
```

### Step 5 — Integrate the pool into `DockerExecutor`

- [x] **Step 5: Update `DockerExecutor` constructor + `start` + `wait`**

In the constructor `DockerExecutorOpts`, add `warmPoolSize?: number` (default 0). Construct a `WarmContainerPool` only if `warmPoolSize > 0`.

In `start(task)`:

- If pool is enabled and the task isn't doing anything fundamentally different per-task (it isn't — only branch/file content changes which the reset script handles), acquire from the pool. Use `buildContainerSpec` with `cloneDir = slot.workdir`.
- Track per-handle `slotId` and `isWarm` on the `running` entry (extend the `running` Map's value-type with `slotId?: string; isWarm: boolean`).
- Replace the T1 placeholder line `host_container_reuse: 0,` in `mergeBenchRow`'s `row: BenchRow` literal with `host_container_reuse: entry.isWarm ? 1 : 0,`.

In `wait(handle)` finally:

- If pool was used: run reset exec, then `pool.release({ slotId, resetOk })`. Skip the existing `container.remove` and workdir `rm`.
- If pool was not used: keep current cleanup path.

For the reset exec:

```ts
async function execReset(container: Container): Promise<boolean> {
  const exec = await container.exec({
    Cmd: [
      'sh',
      '-c',
      'git merge --abort 2>/dev/null || true; git reset --hard HEAD; git clean -fdx -e node_modules',
    ],
    AttachStdout: true,
    AttachStderr: true,
    User: '1001:1001',
  });
  await exec.start({});
  const info = await exec.inspect();
  return info.ExitCode === 0;
}
```

Add a `shutdown()` method on `DockerExecutor` that calls `pool?.shutdown()`. The orchestrator should call this on completion.

### Step 6 — Wire config + CLI flag

- [x] **Step 6: Add `warmPoolSize` to `runOne`/`Orchestrator` signatures**

`packages/core/src/orchestrator/runOne.ts` (and the Orchestrator that calls it) accepts a `warmPoolSize?: number`. When constructing `DockerExecutor`, pass this through.

- [x] **Step 7: Add `--warm-pool=<N>` flag to `packages/cli/src/commands/run.ts`**

```ts
'warm-pool': Flags.integer({ default: 0, description: 'enable warm container pool with up to N slots per image' }),
```

In the command's `run()`, the flag value is passed into the Orchestrator constructor as `warmPoolSize`.

- [x] **Step 8: Config plumbing**

In the orchestrator setup, read `executor.warm_pool_size` from `config.yaml` and use the CLI flag if provided, otherwise the config value, otherwise 0.

- [x] **Step 9: Update template config**

In `packages/templates/assets/config.yaml.tpl`, add:

```yaml
executor:
  warm_pool_size: 0 # >0 enables warm container pool (max slots per image)
```

### Step 10 — Build and test

- [x] **Step 10: Run all tests**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm run build
npm test
```

### Step 11 — Run measurement with `--warm-pool=2`

- [ ] **Step 11: Reset state**

Reset node-ts-toy `.arandano/state.json` (keep AS1/AS2 only).

- [ ] **Step 12: Run with warm pool enabled**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers --warm-pool=2
```

Expect: T4 + T5 run in parallel using two cold slots; T6 (after T4 ends) reuses T4's warm slot.

- [ ] **Step 13: Verify bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

- T4 and T5: `host_container_reuse = 0` (cold).
- T6: `host_container_reuse = 1` (warm — should show shorter `host_create_ms` + `host_pull_ms` ≈ 0).

### Step 14 — Confirm escape-hatch (default config) still works

- [ ] **Step 14: Run again without the flag**

```powershell
# (reset state again first)
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

Expect: every task has `host_container_reuse = 0`.

### Step 15 — Record results and commit

- [ ] **Step 15: Append "+ T6 container pool (`--warm-pool=2`)" row** in plan.md Results table.

- [ ] **Step 16: Tick T6 checkbox**

- [ ] **Step 17: Commit**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add packages docs
git commit -m ":zap: perf(executor): WarmContainerPool with persistent per-slot workspaces"
```

---

**Done when:** `--warm-pool=2` produces `host_container_reuse=1` on T6, default behavior (no flag) reproduces pre-T6 behavior, all tests pass, Results row recorded.
