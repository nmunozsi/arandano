> **Location:** `docs/perf-instrumentation/plans/instrumentation/T4-arandano-bench-cli-command.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md
> ├── T4-arandano-bench-cli-command.md                                  ← you are here
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 4: `arandano bench` CLI command (TDD)

**Goal:** Read `.arandano/bench.csv`, optionally filter by `--task`/`--plan`/`--last`, and print a per-phase median+p95 table plus a "delta vs previous run for the same task" column.

**Files:**

- Create: `packages/cli/src/commands/bench.ts`
- Create: `packages/cli/src/__tests__/bench.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/__tests__/bench.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-bench-cmd-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const SAMPLE_CSV =
  [
    'timestamp,task_id,stack,image_sha,total_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms',
    '2026-05-14T01:00Z,T4,node-ts,sha256:a,900000,8000,3000,870000,180000,400000,80000,4000',
    '2026-05-14T02:00Z,T4,node-ts,sha256:a,820000,8000,3000,790000,170000,380000,75000,4000',
    '2026-05-14T03:00Z,T5,node-ts,sha256:a,910000,8000,3000,880000,180000,410000,80000,4000',
  ].join('\n') + '\n';

describe('arandano bench', () => {
  it('summarises rows from the CSV', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'bench.csv'), SAMPLE_CSV, 'utf8');
    const logs: string[] = [];
    const orig = process.cwd();
    process.chdir(dir);
    try {
      const Bench = (await import('../commands/bench.js')).default;
      const cmd = new Bench([], {} as never);
      cmd.log = (m?: unknown) => logs.push(String(m));
      await cmd.run();
    } finally {
      process.chdir(orig);
    }
    const out = logs.join('\n');
    expect(out).toContain('T4');
    expect(out).toContain('T5');
    expect(out).toContain('total_ms');
  });

  it('filters by --task', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'bench.csv'), SAMPLE_CSV, 'utf8');
    const logs: string[] = [];
    const orig = process.cwd();
    process.chdir(dir);
    try {
      const Bench = (await import('../commands/bench.js')).default;
      const cmd = new Bench(['--task', 'T4'], {} as never);
      cmd.log = (m?: unknown) => logs.push(String(m));
      await cmd.run();
    } finally {
      process.chdir(orig);
    }
    const out = logs.join('\n');
    expect(out).toContain('T4');
    expect(out).not.toContain('T5');
  });

  it('reports no data when CSV is missing', async () => {
    const logs: string[] = [];
    const orig = process.cwd();
    process.chdir(dir);
    try {
      const Bench = (await import('../commands/bench.js')).default;
      const cmd = new Bench([], {} as never);
      cmd.log = (m?: unknown) => logs.push(String(m));
      await cmd.run();
    } finally {
      process.chdir(orig);
    }
    expect(logs.join('\n')).toContain('no benchmark data');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -w packages/cli -- bench
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/commands/bench.ts`**

```ts
import { Command, Flags } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Row {
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

const NUM_COLS: Array<keyof Row> = [
  'total_ms',
  'host_pull_ms',
  'host_clone_ms',
  'host_wait_ms',
  'worker_install_ms',
  'worker_cli_ms',
  'worker_gates_ms',
  'worker_push_ms',
];

function parseCsv(text: string): Row[] {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return {
      timestamp: obj.timestamp ?? '',
      task_id: obj.task_id ?? '',
      stack: obj.stack ?? '',
      image_sha: obj.image_sha ?? '',
      total_ms: Number(obj.total_ms ?? 0),
      host_pull_ms: Number(obj.host_pull_ms ?? 0),
      host_clone_ms: Number(obj.host_clone_ms ?? 0),
      host_wait_ms: Number(obj.host_wait_ms ?? 0),
      worker_install_ms: Number(obj.worker_install_ms ?? 0),
      worker_cli_ms: Number(obj.worker_cli_ms ?? 0),
      worker_gates_ms: Number(obj.worker_gates_ms ?? 0),
      worker_push_ms: Number(obj.worker_push_ms ?? 0),
    };
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function p95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)));
  return s[idx] ?? 0;
}

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default class Bench extends Command {
  static override description = 'Summarise .arandano/bench.csv with per-phase median and p95.';

  static override flags = {
    task: Flags.string({ description: 'filter to a single task id' }),
    plan: Flags.string({ description: 'reserved — filter by plan slug (not yet implemented)' }),
    last: Flags.integer({ description: 'only consider the last N rows', default: 0 }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Bench);
    const csvPath = join(process.cwd(), '.arandano', 'bench.csv');
    let text: string;
    try {
      text = await readFile(csvPath, 'utf8');
    } catch {
      this.log(`no benchmark data found at ${csvPath}`);
      return;
    }
    let rows = parseCsv(text);
    if (flags.task) rows = rows.filter((r) => r.task_id === flags.task);
    if (flags.last && flags.last > 0) rows = rows.slice(-flags.last);

    if (rows.length === 0) {
      this.log('no benchmark data after filters');
      return;
    }

    // Header
    this.log(
      `samples: ${rows.length}  tasks: ${[...new Set(rows.map((r) => r.task_id))].join(',')}`,
    );
    this.log('');
    this.log('phase                       median        p95     last      Δ-vs-prev');

    for (const col of NUM_COLS) {
      const vals = rows.map((r) => r[col] as number);
      const last = vals[vals.length - 1] ?? 0;
      const prev = vals[vals.length - 2];
      const delta =
        prev != null && prev !== 0 ? `${(((last - prev) / prev) * 100).toFixed(1)}%` : '—';
      this.log(
        `${col.padEnd(26)} ${fmt(median(vals)).padStart(8)}  ${fmt(p95(vals)).padStart(8)}  ${fmt(last).padStart(8)}   ${delta.padStart(7)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -w packages/cli -- bench
```

Expected: 3 passing.

- [ ] **Step 5: Build to regenerate the oclif manifest**

```bash
cd ../..
npm run build
```

- [ ] **Step 6: Smoke-test the command on a fresh project**

```bash
cd packages/cli && node ./dist/bin.js bench
```

Expected (no `.arandano/bench.csv` in this directory): `no benchmark data found at ...`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/bench.ts packages/cli/src/__tests__/bench.test.ts packages/cli/oclif.manifest.json
git commit -m "feat(cli): arandano bench command summarising bench.csv"
```

---
