> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T5-gitnexus-skip-when-fresh.md`
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
> ├── T5-gitnexus-skip-when-fresh.md                   ← you are here
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 5: Surface gitnexus prewarm status into bench.csv (+ mtime safeguard)

**Scope shift discovered during planning:** `cacheHost.ts:71-80` already has a git-HEAD-based cache that returns `'cache-hit'` when HEAD hasn't changed. So a multi-task plan already benefits from cache hits on tasks 2+. The real problem is `host_gitnexus_prewarm_ms` is hardcoded to 0 in `DockerExecutor.mergeBenchRow` — we have no visibility into what's actually happening.

**Goal:**

1. Measure gitnexus prewarm time accurately and surface it in bench.csv.
2. Add `host_gitnexus_skipped` column (0=ran/rebuilt, 1=cache-hit, 2=not-applicable).
3. **Conditional**: only add an mtime-based safeguard if verification shows the HEAD cache is missing in normal multi-task runs.

**Files:**

- Modify: `packages/core/src/orchestrator/runOne.ts` — time and capture gitnexus return value; pass to executor.
- Modify: `packages/core/src/types/executor.ts` — `TaskRun` gains `gitnexusStatus?: 'rebuilt'|'cache-hit'|'failed'|'skipped'|'not-applicable'` and `gitnexusPrewarmMs?: number`.
- Modify: `packages/executors-docker/src/DockerExecutor.ts` — read `task.gitnexusStatus`/`gitnexusPrewarmMs`; emit into `mergeBenchRow`.
- Test: `packages/core/src/orchestrator/__tests__/runOne.test.ts` — assert prewarm time + status propagation.

---

### Step 1 — Failing test for prewarm time propagation

- [x] **Step 1: Add this test to `packages/core/src/orchestrator/__tests__/runOne.test.ts`**

```ts
it('passes gitnexusStatus and gitnexusPrewarmMs into the executor.start TaskRun', async () => {
  await seedProject();
  const taskPath = join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-x.md');
  await mkdir(dirname(taskPath), { recursive: true });
  await writeFile(taskPath, '---\nid: T1\ntitle: x\nrole: coder\nmcp:\n  - gitnexus\n---\nbody');
  vi.doMock('../../mcp/cacheHost.js', () => ({
    ensureGitnexusCacheHost: vi.fn().mockResolvedValue('cache-hit'),
  }));
  const startSpy = vi.fn().mockResolvedValue({ id: 'h' });
  await runOne({
    projectRoot: dir,
    taskId: 'T1',
    executor: { start: startSpy, wait: vi.fn().mockResolvedValue({ exitCode: 0, reason: 'ok' }) },
  });
  const taskRun = (startSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
  expect(taskRun['gitnexusStatus']).toBe('cache-hit');
  expect(typeof taskRun['gitnexusPrewarmMs']).toBe('number');
  expect(taskRun['gitnexusPrewarmMs']).toBeGreaterThanOrEqual(0);
  vi.doUnmock('../../mcp/cacheHost.js');
});
```

- [x] **Step 2: Run — expect FAIL**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npx vitest run packages/core/src/orchestrator/__tests__/runOne.test.ts
```

### Step 3 — Extend `TaskRun` in `packages/core/src/types/executor.ts`

- [x] **Step 3: Add the two fields**

```ts
export interface TaskRun {
  // ... existing fields ...
  gitnexusStatus?: 'rebuilt' | 'cache-hit' | 'failed' | 'skipped' | 'not-applicable';
  gitnexusPrewarmMs?: number;
}
```

### Step 4 — Time and capture the gitnexus call in `runOne.ts`

- [x] **Step 4: Replace the gitnexus prewarm block in `packages/core/src/orchestrator/runOne.ts`**

Find:

```ts
// Host-side gitnexus cache pre-warm — soft-fail.
if (taskRun.mcpServers.includes('gitnexus')) {
  const { ensureGitnexusCacheHost } = await import('../mcp/cacheHost.js');
  await ensureGitnexusCacheHost(projectRoot, {
    log: (line) => process.stderr.write(line + '\n'),
  });
}
```

Replace with:

```ts
// Host-side gitnexus cache pre-warm — soft-fail.
let gitnexusStatus: 'rebuilt' | 'cache-hit' | 'failed' | 'skipped' | 'not-applicable' =
  'not-applicable';
let gitnexusPrewarmMs = 0;
if (taskRun.mcpServers.includes('gitnexus')) {
  const { ensureGitnexusCacheHost } = await import('../mcp/cacheHost.js');
  const t0 = Date.now();
  gitnexusStatus = await ensureGitnexusCacheHost(projectRoot, {
    log: (line) => process.stderr.write(line + '\n'),
  });
  gitnexusPrewarmMs = Date.now() - t0;
}
taskRun.gitnexusStatus = gitnexusStatus;
taskRun.gitnexusPrewarmMs = gitnexusPrewarmMs;
```

- [x] **Step 5: Re-run test — expect PASS**

### Step 6 — Wire into `DockerExecutor.mergeBenchRow`

- [x] **Step 6: Update `DockerExecutor.start` to retain `gitnexusStatus`/`gitnexusPrewarmMs`**

Add to the `running.set(...)` entry:

```ts
this.running.set(id, {
  containerId: container.id,
  container,
  folder,
  cloneDir,
  perf,
  startedAt,
  gitnexusStatus: task.gitnexusStatus,
  gitnexusPrewarmMs: task.gitnexusPrewarmMs ?? 0,
});
```

(Extend the `running` Map's value-type accordingly: add `gitnexusStatus?: string` and `gitnexusPrewarmMs: number`.)

- [x] **Step 7: Update `mergeBenchRow` to emit the new columns**

In `DockerExecutor.ts`, find the `row: BenchRow = { ... }` literal and update **two lines** that T1 left as placeholders:

Replace:

```ts
host_gitnexus_prewarm_ms: 0, // measured in runOne.ts, not here
```

with:

```ts
host_gitnexus_prewarm_ms: entry.gitnexusPrewarmMs,
```

Replace:

```ts
host_gitnexus_skipped: 0,       // T5 will set this; placeholder for now
```

with:

```ts
host_gitnexus_skipped:
  entry.gitnexusStatus === 'cache-hit'
    ? 1
    : entry.gitnexusStatus === 'not-applicable'
    ? 2
    : 0,
```

`entry` here is the `running.get(handle.id)` entry. `mergeBenchRow` is currently called from `wait(...)` — pass `entry` through by widening its options signature to `{ taskId, folder, startedAt, hostPerf, gitnexusStatus, gitnexusPrewarmMs }`, or refactor to accept the full entry. The latter is cleaner.

### Step 8 — Run tests + build

- [x] **Step 8: Test + build**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm run build
npm test
```

### Step 9 — Run measurement (no worker change needed)

- [ ] **Step 9: Reset state and run plan**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

- [ ] **Step 10: Capture bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

Look at `host_gitnexus_skipped` for T4, T5, T6 (executed sequentially after T4/T5 finish in parallel):

- T4 and T5 (parallel): one likely rebuilt (`host_gitnexus_skipped=0`), the other likely cache-hit (`host_gitnexus_skipped=1`) — depends on race.
- T6 (after): likely cache-hit (`host_gitnexus_skipped=1`).

### Step 11 — Decide whether the mtime safeguard is needed

- [ ] **Step 11: Inspect results**

- If at least 2 of (T4/T5/T6) show `host_gitnexus_skipped=1`, the HEAD-based cache is working. **Skip the mtime safeguard entirely** and proceed to Step 14.
- If all tasks show `host_gitnexus_skipped=0`, the HEAD cache is missing for some reason. Proceed to Step 12.

### Step 12 — (Conditional) Add mtime safeguard

- [ ] **Step 12: Modify `cacheHost.ts:ensureGitnexusCacheHost`**

Before the existing HEAD check, add an mtime check:

```ts
const indexPath = join(workspaceRoot, '.gitnexus', 'index.json');
const indexStat = await stat(indexPath).catch(() => null);
if (indexStat) {
  // glob source files and find newest mtime
  const sourceMtime = await newestSourceMtime(workspaceRoot); // helper to implement
  if (indexStat.mtimeMs > sourceMtime) {
    log(`gitnexus: mtime-skip (index newer than all sources)`);
    return 'cache-hit';
  }
}
```

`newestSourceMtime` walks `src/`, `lib/`, `packages/`, `app/` directories for `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.py`, `*.go` files; returns max mtimeMs.

- [ ] **Step 13: Test + measure again** as in Steps 8-10.

### Step 14 — Record results and commit

- [ ] **Step 14: Append "+ T5 gitnexus skip" row** in plan.md Results table.

- [ ] **Step 15: Tick T5 checkbox**

- [ ] **Step 16: Commit**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add packages docs
git commit -m ":zap: perf(executor): surface gitnexus prewarm time + cache-hit status in bench"
```

---

**Done when:** `host_gitnexus_prewarm_ms` is non-zero for at least one task, `host_gitnexus_skipped` is `1` for at least one task (or mtime safeguard added if not), Results row recorded.
