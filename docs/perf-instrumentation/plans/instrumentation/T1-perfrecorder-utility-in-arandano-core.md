> **Location:** `docs/perf-instrumentation/plans/instrumentation/T1-perfrecorder-utility-in-arandano-core.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md                       ← you are here
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md
> ├── T4-arandano-bench-cli-command.md
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 1: `PerfRecorder` utility in `@arandano/core` (TDD)

**Goal:** A tiny, dependency-free recorder that wraps phases with a start/stop API and serialises the records to `timings.json`. Reused by both host and worker.

**Files:**

- Create: `packages/core/src/perf.ts`
- Create: `packages/core/src/__tests__/perf.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/perf.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerfRecorder } from '../perf.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-perf-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('PerfRecorder', () => {
  it('records the duration of a single phase', async () => {
    const r = new PerfRecorder();
    const stop = r.start('install');
    await new Promise((res) => setTimeout(res, 20));
    stop();
    const recs = r.records();
    expect(recs).toHaveLength(1);
    expect(recs[0]?.phase).toBe('install');
    expect(recs[0]?.ms).toBeGreaterThanOrEqual(15);
  });

  it('records multiple phases in insertion order', () => {
    const r = new PerfRecorder();
    r.start('a')();
    r.start('b')();
    r.start('c')();
    expect(r.records().map((x) => x.phase)).toEqual(['a', 'b', 'c']);
  });

  it('writes timings.json with task_id, host, worker, total_ms fields', async () => {
    const r = new PerfRecorder();
    r.start('install')();
    r.start('cli')();
    const path = join(dir, 'timings.json');
    await r.writeTimingsJson(path, { taskId: 'T1', side: 'worker' });
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(parsed['task_id']).toBe('T1');
    expect(parsed['worker']).toEqual(
      expect.objectContaining({ install: expect.any(Number), cli: expect.any(Number) }),
    );
    expect(parsed['total_ms']).toBeGreaterThanOrEqual(0);
  });

  it('does not double-count when stop is called twice', () => {
    const r = new PerfRecorder();
    const stop = r.start('x');
    stop();
    stop();
    expect(r.records()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -w packages/core -- perf
```

Expected: `Cannot find module '../perf.js'` or similar.

- [ ] **Step 3: Implement `packages/core/src/perf.ts`**

```ts
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PhaseRecord {
  phase: string;
  ms: number;
}

export interface TimingsFile {
  task_id: string;
  stack?: string;
  image?: string;
  host?: Record<string, number>;
  worker?: Record<string, number>;
  total_ms: number;
}

export class PerfRecorder {
  private readonly recs: PhaseRecord[] = [];

  start(phase: string): () => void {
    const startNs = process.hrtime.bigint();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const ms = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
      this.recs.push({ phase, ms });
    };
  }

  records(): PhaseRecord[] {
    return [...this.recs];
  }

  asObject(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.recs) out[r.phase] = (out[r.phase] ?? 0) + r.ms;
    return out;
  }

  totalMs(): number {
    return this.recs.reduce((a, r) => a + r.ms, 0);
  }

  async writeTimingsJson(
    path: string,
    opts: { taskId: string; side: 'host' | 'worker'; stack?: string; image?: string },
  ): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const payload: TimingsFile = {
      task_id: opts.taskId,
      stack: opts.stack,
      image: opts.image,
      total_ms: this.totalMs(),
    };
    payload[opts.side] = this.asObject();
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  }
}

/** Read a timings.json file written by either side, returning null on missing file. */
export async function readTimingsJson(path: string): Promise<TimingsFile | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as TimingsFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -w packages/core -- perf
```

Expected: 4 passing.

- [ ] **Step 5: Export from `@arandano/core`**

Edit `packages/core/src/index.ts` and add:

```ts
export { PerfRecorder, readTimingsJson } from './perf.js';
export type { PhaseRecord, TimingsFile } from './perf.js';
```

- [ ] **Step 6: Build and run the whole test suite**

```bash
npm run build
npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/perf.ts packages/core/src/__tests__/perf.test.ts packages/core/src/index.ts
git commit -m "feat(core): PerfRecorder utility for per-phase timings"
```

---
