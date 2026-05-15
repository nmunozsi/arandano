> **Location:** `docs/perf-instrumentation/plans/instrumentation/T3-instrument-dockerexecutor-and-add-csv-merger.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md                ← you are here
> ├── T4-arandano-bench-cli-command.md
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 3: Instrument `DockerExecutor` (host side) and add CSV merger (TDD)

**Goal:** Host side records `pull`, `clone`, `create`, `wait`, `copy_artifacts`. After `wait()` succeeds, the executor reads the worker's `timings.json`, merges with its own records, appends one row to `.arandano/bench.csv`.

**Files (in `arandano/`):**

- Create: `packages/executors-docker/src/benchCsv.ts`
- Create: `packages/executors-docker/src/__tests__/benchCsv.test.ts`
- Modify: `packages/executors-docker/src/DockerExecutor.ts`
- Modify: `packages/executors-docker/src/__tests__/DockerExecutor.test.ts`

### 3a — CSV writer with mutex (TDD)

- [ ] **Step 1: Write the failing test**

`packages/executors-docker/src/__tests__/benchCsv.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendBenchRow, type BenchRow } from '../benchCsv.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-bench-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const row = (over: Partial<BenchRow> = {}): BenchRow => ({
  timestamp: '2026-05-14T12:00:00Z',
  task_id: 'T4',
  stack: 'node-ts',
  image_sha: 'sha256:abc',
  total_ms: 900000,
  host_pull_ms: 8000,
  host_clone_ms: 3000,
  host_wait_ms: 870000,
  worker_install_ms: 180000,
  worker_cli_ms: 410000,
  worker_gates_ms: 80000,
  worker_push_ms: 4000,
  ...over,
});

describe('appendBenchRow', () => {
  it('writes the header on first call', async () => {
    const csv = join(dir, 'bench.csv');
    await appendBenchRow(csv, row());
    const content = await readFile(csv, 'utf8');
    expect(content.split('\n')[0]).toContain('timestamp,task_id,stack,image_sha,total_ms');
    expect(content.split('\n')[1]).toContain('T4');
  });

  it('appends without re-writing the header', async () => {
    const csv = join(dir, 'bench.csv');
    await appendBenchRow(csv, row({ task_id: 'T4' }));
    await appendBenchRow(csv, row({ task_id: 'T5' }));
    const lines = (await readFile(csv, 'utf8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('T4');
    expect(lines[2]).toContain('T5');
  });

  it('serialises concurrent appends', async () => {
    const csv = join(dir, 'bench.csv');
    await Promise.all([
      appendBenchRow(csv, row({ task_id: 'T4' })),
      appendBenchRow(csv, row({ task_id: 'T5' })),
      appendBenchRow(csv, row({ task_id: 'T6' })),
    ]);
    const lines = (await readFile(csv, 'utf8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3 rows
    const ids = lines.slice(1).map((l) => l.split(',')[1]);
    expect(ids.sort()).toEqual(['T4', 'T5', 'T6']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -w packages/executors-docker -- benchCsv
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/executors-docker/src/benchCsv.ts`**

```ts
import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface BenchRow {
  timestamp: string;
  task_id: string;
  stack: string;
  image_sha: string;
  total_ms: number;
  host_pull_ms: number;
  host_clone_ms: number;
  host_wait_ms: number;
  worker_install_ms: number;
  worker_cli_ms: number;
  worker_gates_ms: number;
  worker_push_ms: number;
}

const HEADER =
  'timestamp,task_id,stack,image_sha,total_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms';

// Module-level mutex keyed by absolute file path so concurrent appends to the
// same CSV serialise even when called from different DockerExecutor instances
// (e.g. independent tests).
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  locks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (locks.get(key) === next) locks.delete(key);
  }
}

function toCsvLine(r: BenchRow): string {
  return [
    r.timestamp,
    r.task_id,
    r.stack,
    r.image_sha,
    r.total_ms,
    r.host_pull_ms,
    r.host_clone_ms,
    r.host_wait_ms,
    r.worker_install_ms,
    r.worker_cli_ms,
    r.worker_gates_ms,
    r.worker_push_ms,
  ].join(',');
}

export async function appendBenchRow(path: string, row: BenchRow): Promise<void> {
  await withLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    let needsHeader = false;
    try {
      const head = await readFile(path, 'utf8');
      if (!head.startsWith('timestamp,')) needsHeader = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') needsHeader = true;
      else throw e;
    }
    if (needsHeader) {
      await writeFile(path, HEADER + '\n', 'utf8');
    }
    await appendFile(path, toCsvLine(row) + '\n', 'utf8');
  });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -w packages/executors-docker -- benchCsv
```

Expected: 3 passing.

### 3b — DockerExecutor instrumentation

- [ ] **Step 5: Add imports to `DockerExecutor.ts`**

At the top of `packages/executors-docker/src/DockerExecutor.ts`, add `writeFile` to the existing `node:fs/promises` import (which currently brings in `cp` and `rm`), and add two new imports:

```ts
import { cp, rm, writeFile } from 'node:fs/promises';
import { PerfRecorder, readTimingsJson } from '@arandano/core';
import { appendBenchRow, type BenchRow } from './benchCsv.js';
```

- [ ] **Step 6: Wrap `start()` host phases with the recorder**

Modify `start()` so each step is timed. The recorder must be saved on the `running` map entry so `wait()` can use it.

First update the running-map shape:

```ts
private readonly running = new Map<
  string,
  {
    containerId: string;
    container: Container;
    folder: string;
    cloneDir: string;
    perf: PerfRecorder;
    startedAt: Date;
  }
>();
```

Then in `start()`, after `const folder = runFolder({...})`, add:

```ts
const perf = new PerfRecorder();
const startedAt = this.opts.now!();
```

Wrap the clone step:

```ts
const stopClone = perf.start('clone');
const cloneDir = join(tmpdir(), `arandano-task-${task.taskId}-${Date.now()}`);
let remoteUrl = '';
try {
  const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], {
    cwd: this.opts.projectRoot,
  });
  remoteUrl = stdout.trim();
} catch {
  // no remote
}
await this.opts.cloneProject!(this.opts.projectRoot, cloneDir, remoteUrl);
stopClone();
```

Wrap the pull and create steps:

```ts
const stopPull = perf.start('pull');
await this.opts.client!.pull(this.opts.image);
stopPull();

const stopCreate = perf.start('create');
const container = await this.opts.client!.createContainer(spec as unknown);
await container.start();
stopCreate();
```

Update the `running.set` call to include `perf` and `startedAt`:

```ts
this.running.set(id, { containerId: container.id, container, folder, cloneDir, perf, startedAt });
```

- [ ] **Step 7: Wrap `wait()` and append the bench row**

In `wait()`, after `const entry = this.running.get(h.id);` check, add:

```ts
const stopWait = entry.perf.start('wait');
```

Replace the existing try-block contents so that `wait()` is timed and `copy_artifacts` is its own phase:

```ts
try {
  const { StatusCode } = await entry.container.wait();
  stopWait();

  const stopCopy = entry.perf.start('copy_artifacts');
  const cloneRunDir = join(entry.cloneDir, '.arandano', 'runs', entry.folder);
  const mainRunDir = join(this.opts.projectRoot, '.arandano', 'runs', entry.folder);
  await cp(cloneRunDir, mainRunDir, { recursive: true }).catch(() => {});
  stopCopy();

  // Merge worker timings with host timings and append one CSV row.
  await this.appendBenchRow({
    taskId: this.taskIdFromHandle(h.id),
    folder: entry.folder,
    startedAt: entry.startedAt,
    hostPerf: entry.perf,
  });

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
  await rm(entry.cloneDir, { recursive: true, force: true }).catch(() => {});
  this.running.delete(h.id);
}
```

- [ ] **Step 8: Add the helper methods to the class**

Inside the `DockerExecutor` class, add these private methods:

```ts
private taskIdFromHandle(id: string): string {
  // handle id is `${task.taskId}::${container.id}`
  return id.split('::', 1)[0]!;
}

private async appendBenchRow(opts: {
  taskId: string;
  folder: string;
  startedAt: Date;
  hostPerf: PerfRecorder;
}): Promise<void> {
  const timingsPath = join(
    this.opts.projectRoot,
    '.arandano',
    'runs',
    opts.folder,
    'timings.json',
  );
  const workerTimings = await readTimingsJson(timingsPath).catch(() => null);
  const host = opts.hostPerf.asObject();
  const worker = workerTimings?.worker ?? {};

  // Sum all gate.* keys
  const workerGatesMs = Object.entries(worker)
    .filter(([k]) => k.startsWith('gate.'))
    .reduce((a, [, v]) => a + v, 0);

  const row: BenchRow = {
    timestamp: opts.startedAt.toISOString(),
    task_id: opts.taskId,
    stack: workerTimings?.stack ?? 'unknown',
    image_sha: this.opts.image,
    total_ms: opts.hostPerf.totalMs() + (workerTimings?.total_ms ?? 0),
    host_pull_ms: host['pull'] ?? 0,
    host_clone_ms: host['clone'] ?? 0,
    host_wait_ms: host['wait'] ?? 0,
    worker_install_ms: worker['install'] ?? 0,
    worker_cli_ms: worker['cli'] ?? 0,
    worker_gates_ms: workerGatesMs,
    worker_push_ms: worker['push_and_pr'] ?? 0,
  };

  // Rewrite the merged timings.json on disk with host data added.
  if (workerTimings) {
    const merged = { ...workerTimings, host, total_ms: row.total_ms };
    await writeFile(timingsPath, JSON.stringify(merged, null, 2), 'utf8');
  }

  const csvPath = join(this.opts.projectRoot, '.arandano', 'bench.csv');
  await appendBenchRow(csvPath, row);
}
```

- [ ] **Step 9: Update existing DockerExecutor tests**

The existing tests pass `cloneProject: async () => {}` to bypass the real clone. They do not write a timings.json. The new bench-row append step will run but `readTimingsJson` will return null and produce a row with mostly zeros. That's acceptable — but the test fixtures previously had no `.arandano/` dir, so the CSV write will land in a temp dir. **Add `projectRoot` to each existing test that creates a real tmpdir** so the CSV append doesn't pollute `C:\` or fail on Windows.

Update each `new DockerExecutor({ projectRoot: '/r', ... })` test in `packages/executors-docker/src/__tests__/DockerExecutor.test.ts`. Wrap each test in a `beforeEach` that creates a tmpdir and use it as projectRoot.

Edit the file so the existing `describe('DockerExecutor', ...)` block becomes:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

// ... fakeContainer and `task` definitions remain unchanged ...

describe('DockerExecutor', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'arandano-dx-'));
    return async () => rm(projectRoot, { recursive: true, force: true });
  });

  it('starts a container and returns a handle', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => new Date('2026-05-08T19:30:00Z'),
      cloneProject: async () => {},
    });
    const h = await exec.start(task);
    expect(h.id).toContain('T1');
    expect(c.start).toHaveBeenCalled();
  });

  // (Update the other three tests the same way — replace `projectRoot: '/r'` with `projectRoot,`.)
});
```

- [ ] **Step 10: Run all tests**

```bash
npm test
```

Expected: all green, including the new `benchCsv.test.ts` and the updated `DockerExecutor.test.ts`.

- [ ] **Step 11: Commit**

```bash
git add packages/executors-docker/src/benchCsv.ts packages/executors-docker/src/__tests__/benchCsv.test.ts packages/executors-docker/src/DockerExecutor.ts packages/executors-docker/src/__tests__/DockerExecutor.test.ts
git commit -m "feat(executors-docker): host-side phase instrumentation and bench.csv append"
```

---
