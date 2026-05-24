> **Location:** `docs/perf-instrumentation/plans/instrumentation/T8-improvement-b-skip-docker-pull-when-local-digest-m.md`
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
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md          ← you are here
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 8: Optimizations — npm cache volume + model selection + context injection

**Goal:** Apply three optimizations targeting `worker_install_ms` (6.4%) and `worker_cli_ms` (64%), then re-measure. Each sub-task is independent; implement in order, measure after all three are live.

**Sub-task A — npm cache volume** (`worker_install_ms`)
**Sub-task B — per-task model selection** (`worker_cli_ms`)
**Sub-task C — selective context injection** (`worker_cli_ms`)

---

### Sub-task A: npm cache volume

**Goal:** Mount a Docker named volume at the worker's npm cache directory so `npm install` reuses downloaded packages across runs.

**Files:**

- Modify: `packages/executors-docker/src/containerSpec.ts`
- Add/modify: `packages/executors-docker/src/__tests__/containerSpec.test.ts`

- [ ] **A.1: Add the named-volume bind to `containerSpec.ts`**

The worker runs as uid 1001. The npm cache lives at `/home/worker/.npm`. Edit `HostConfig.Binds`:

```ts
HostConfig: {
  Binds: [`${projectRoot}:${task.workdir}`, 'arandano-npm-cache:/home/worker/.npm'],
  AutoRemove: false,
},
```

Docker creates the `arandano-npm-cache` named volume automatically on first use.

- [ ] **A.2: Add or update the containerSpec test**

Assert that the binds include the npm cache volume:

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
```

---

### Sub-task B: per-task model selection

**Goal:** Allow tasks to declare a preferred model in frontmatter (`model: claude-haiku-4-5-20251001`). The model selection follows the priority chain: `task frontmatter → config.yaml role → config.yaml global → default`.

**Files:**

- Modify: `packages/core/src/runOne.ts` — read `taskMd.frontmatter.model`, prefer over config
- Modify: `packages/core/src/types/` — ensure `TaskFrontmatter` has an optional `model` field

**Background:** `ARANDANO_MODEL` is already passed to the container and the worker already reads it for `--model <model>`. The only missing piece is the frontmatter → `TaskRun.model` override.

- [ ] **B.1: Add `model` to `TaskFrontmatter` type** (if not already present)

```ts
export interface TaskFrontmatter {
  tdd?: 'strict' | 'relaxed' | 'off';
  model?: string; // ← optional override, e.g. 'claude-haiku-4-5-20251001'
  inject_context?: string[]; // ← optional paths, used by Sub-task C
  cli_budget_ms?: number; // ← optional, used by T9
  // ... existing fields ...
}
```

- [ ] **B.2: Apply frontmatter model override in `runOne.ts`**

Following the same pattern as `tdd`:

```ts
const model = taskMd.frontmatter.model ?? role.model ?? config.defaultModel ?? 'claude-sonnet-4-6';
```

Pass `model` into the `TaskRun` object so `containerSpec.ts` picks it up via `ARANDANO_MODEL`.

- [ ] **B.3: Add a test**

In `packages/core/src/__tests__/runOne.test.ts` (or wherever `runOne` is tested), assert that `taskMd.frontmatter.model` wins over the config value when both are set.

---

### Sub-task C: selective context injection

**Goal:** Allow tasks to declare files to inject into the prompt via `inject_context: [src/greet.ts, package.json]` in frontmatter. The worker reads and serializes these files into the prompt before calling `claude`, reducing file-discovery tool calls.

**Files:**

- Modify: `packages/core/src/runOne.ts` — read `inject_context`, pass as `ARANDANO_INJECT_CONTEXT` env var
- Modify: `packages/executors-docker/src/containerSpec.ts` — include `ARANDANO_INJECT_CONTEXT` in env
- Modify: `arandano-worker/lib/src/driver.ts` — read env var, serialize files, prepend to prompt

- [ ] **C.1: Serialize `inject_context` in `runOne.ts`**

```ts
const injectContext = taskMd.frontmatter.inject_context ?? [];
// Pass as colon-separated relative paths; worker resolves against workdir
const injectContextEnv = injectContext.join(':');
```

Pass `ARANDANO_INJECT_CONTEXT=${injectContextEnv}` via `containerSpec.ts` alongside the other env vars.

- [ ] **C.2: Worker reads and serializes injected files**

In `driver.ts`, before building the prompt for `invokeCli`:

```ts
async function buildContextBlock(workdir: string, paths: string[]): Promise<string> {
  const blocks: string[] = [];
  for (const rel of paths) {
    try {
      const content = await readFile(join(workdir, rel), 'utf8');
      blocks.push(`\`\`\`${rel}\n${content}\n\`\`\``);
    } catch {
      // skip missing files silently
    }
  }
  return blocks.length > 0
    ? `<injected-context>\n${blocks.join('\n\n')}\n</injected-context>\n\n`
    : '';
}

const injectPaths = (process.env.ARANDANO_INJECT_CONTEXT ?? '').split(':').filter(Boolean);
const contextBlock = await buildContextBlock(workdir, injectPaths);
// Prepend contextBlock to the task prompt passed to invokeCli
```

The injected context appears at the top of the prompt, before the task markdown. Claude still has full tool access for anything beyond what's injected.

- [ ] **C.3: Add a test**

Unit-test `buildContextBlock` with a tmp directory containing two files. Assert the output format includes both file blocks and that missing files are silently skipped.

---

### Measure and record delta

- [ ] **Step 8.1: Build and push worker**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
git add -A
git commit -m ":zap: perf(driver): per-task model selection and selective context injection"
git push origin main
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
```

- [ ] **Step 8.2: Build host**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm test
npm run build
```

- [ ] **Step 8.3: Re-measure**

Reset node-ts-toy state (keep T1), then run:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=2026-05-11-three-helpers --no-architect
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench --last 4
```

Run **twice** (reset state between runs) to see the warm-cache effect of Sub-task A. Compare `cli_tool_calls` and `worker_cli_ms` from T7 baseline vs. after T8.

- [ ] **Step 8.4: Record the delta in the Results section**

Add a Results section to `plan.md` (or append to the existing addendum):

```markdown
## Results

| Step         | total_ms  | worker_install_ms | worker_cli_ms | cli_tool_calls | Notes |
| ------------ | --------- | ----------------- | ------------- | -------------- | ----- |
| Baseline     | 1,006,005 | 64,341            | 644,209       | (see T7 run)   |       |
| + T8 (A+B+C) | TBD       | TBD               | TBD           | TBD            |       |
```

Replace TBD with real numbers from `arandano bench`.

- [ ] **Step 8.5: Commit host-side changes**

```bash
git add packages/executors-docker/src/containerSpec.ts \
         packages/core/src/runOne.ts \
         packages/core/src/types/ \
         packages/executors-docker/src/__tests__/
git commit -m ":zap: perf(core): npm cache volume + model selection + context injection"
```

---
