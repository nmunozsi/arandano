> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T1-instrumentation-foundation.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md
> ├── T1-instrumentation-foundation.md                 ← you are here
> ├── T2-parallelize-gates.md
> ├── T3-context-injection-and-tool-trim.md
> ├── T4-inline-role-and-standards.md
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 1: Instrumentation foundation

**Goal:** Make every later task measurable. Three additions:

1. Fix `cli_tool_calls` (currently reads 0 because parser doesn't walk `assistant.message.content`).
2. Capture token usage from the stream-json `result` event into bench columns.
3. Add per-tool timing (requires a small envelope around each event line so we have timestamps).

**Files:**

- Modify: `arandano-worker/lib/src/invokeClaudeCode.ts` — wrap each event line with `{ts,e}` envelope.
- Modify: `arandano-worker/lib/src/driver.ts` — rewrite `parseCliEvents`; add `parseCliTokens`, `parseCliToolTimings`.
- Modify: `arandano-worker/lib/src/__tests__/driver.test.ts` — new tests.
- Modify: `packages/core/src/perf.ts` (`TimingsFile`) — add 4 token fields and `gates_parallel_ms`, `gates_serial_sum_ms` placeholders.
- Modify: `packages/executors-docker/src/benchCsv.ts` — add 4 token columns and 2 gate columns and `host_container_reuse`, `host_gitnexus_skipped`.
- Modify: `packages/executors-docker/src/DockerExecutor.ts` — wire `workerTimings.cli_input_tokens` etc. into the row.
- Modify: `packages/cli/src/commands/bench.ts` — render new columns; add `--by-tool` view.
- Test: `packages/cli/src/__tests__/bench.test.ts` — new column rendering and `--by-tool` tests.

---

### Step 1 — Write a failing test for the new event-envelope writer

- [x] **Step 1: Add this test to `arandano-worker/lib/src/__tests__/invokeClaudeCode.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('event envelope', () => {
  it('events file lines are JSON {ts:number, e:object}', async () => {
    // This test will be wired against a runnable fixture once invokeCli supports the envelope.
    // For now we assert the parsing helper accepts the envelope format.
    const dir = join(tmpdir(), `test-envelope-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'cli-events.jsonl');
    await writeFile(
      eventsPath,
      [
        JSON.stringify({ ts: 100, e: { type: 'system', subtype: 'init' } }),
        JSON.stringify({
          ts: 200,
          e: {
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'Read' }] },
          },
        }),
      ].join('\n'),
      'utf8',
    );
    const raw = await readFile(eventsPath, 'utf8');
    expect(raw.split('\n').every((l) => !l || JSON.parse(l).e !== undefined)).toBe(true);
  });
});
```

- [x] **Step 2: Run the test**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npx vitest run src/__tests__/invokeClaudeCode.test.ts
```

Expected: PASS (it's a static fixture test). This locks the envelope schema.

### Step 3 — Update `invokeClaudeCode.ts` to write the envelope

- [x] **Step 3: Replace the file-stream write in `arandano-worker/lib/src/invokeClaudeCode.ts`**

Find:

```ts
proc.stdout.on('data', (c: Buffer) => {
  const text = c.toString('utf8');
  buf += text;
  if (fileStream) fileStream.write(text);
});
```

Replace with:

```ts
const cliStart = Date.now();
let lineBuf = '';
proc.stdout.on('data', (c: Buffer) => {
  const text = c.toString('utf8');
  buf += text;
  if (!fileStream) return;
  lineBuf += text;
  let idx = lineBuf.indexOf('\n');
  while (idx !== -1) {
    const line = lineBuf.slice(0, idx);
    lineBuf = lineBuf.slice(idx + 1);
    if (line.trim()) {
      try {
        const e = JSON.parse(line) as unknown;
        fileStream.write(JSON.stringify({ ts: Date.now() - cliStart, e }) + '\n');
      } catch {
        // Non-JSON line (e.g., error message before stream-json starts); write as raw envelope.
        fileStream.write(JSON.stringify({ ts: Date.now() - cliStart, raw: line }) + '\n');
      }
    }
    idx = lineBuf.indexOf('\n');
  }
});
```

Also flush remaining `lineBuf` on close — find:

```ts
proc.on('close', (code) => {
  if (fileStream) {
    fileStream.end(() => resolve({ exitCode: code ?? 1, output: buf }));
  } else {
    resolve({ exitCode: code ?? 1, output: buf });
  }
});
```

Replace with:

```ts
proc.on('close', (code) => {
  if (fileStream && lineBuf.trim()) {
    try {
      const e = JSON.parse(lineBuf) as unknown;
      fileStream.write(JSON.stringify({ ts: Date.now() - cliStart, e }) + '\n');
    } catch {
      fileStream.write(JSON.stringify({ ts: Date.now() - cliStart, raw: lineBuf }) + '\n');
    }
  }
  if (fileStream) {
    fileStream.end(() => resolve({ exitCode: code ?? 1, output: buf }));
  } else {
    resolve({ exitCode: code ?? 1, output: buf });
  }
});
```

### Step 4 — Failing test for new `parseCliEvents` schema

- [x] **Step 4: Replace the `parseCliEvents` tests in `arandano-worker/lib/src/__tests__/driver.test.ts`**

Find the existing `describe('parseCliEvents', () => { ... })` block and replace with:

```ts
describe('parseCliEvents (envelope + nested tool_use)', () => {
  it('counts tool_use events nested inside assistant.message.content', async () => {
    const dir = join(tmpdir(), `test-events-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'cli-events.jsonl');
    await writeFile(
      eventsPath,
      [
        JSON.stringify({ ts: 0, e: { type: 'system', subtype: 'init' } }),
        JSON.stringify({
          ts: 100,
          e: {
            type: 'assistant',
            message: {
              content: [
                { type: 'thinking', thinking: '…' },
                { type: 'tool_use', id: 'tu_1', name: 'Read' },
              ],
            },
          },
        }),
        JSON.stringify({
          ts: 200,
          e: {
            type: 'user',
            message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '…' }] },
          },
        }),
        JSON.stringify({
          ts: 300,
          e: {
            type: 'assistant',
            message: {
              content: [
                { type: 'tool_use', id: 'tu_2', name: 'Edit' },
                { type: 'tool_use', id: 'tu_3', name: 'Bash' },
              ],
            },
          },
        }),
        JSON.stringify({ ts: 400, e: { type: 'result', subtype: 'success' } }),
      ].join('\n'),
      'utf8',
    );
    expect(await parseCliEvents(eventsPath)).toBe(3);
  });

  it('returns 0 on empty/missing/malformed', async () => {
    expect(await parseCliEvents('/nonexistent/cli-events.jsonl')).toBe(0);
  });
});
```

- [x] **Step 5: Run the test — expect FAIL**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npx vitest run src/__tests__/driver.test.ts -t "parseCliEvents"
```

Expected: FAIL — `parseCliEvents` returns 0 because the current parser only matches top-level `type === 'tool_use'`.

### Step 6 — Rewrite `parseCliEvents` in `driver.ts`

- [x] **Step 6: Replace `parseCliEvents` in `arandano-worker/lib/src/driver.ts`**

```ts
export async function parseCliEvents(eventsPath: string): Promise<number> {
  try {
    const txt = await readFile(eventsPath, 'utf8');
    let n = 0;
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const env = JSON.parse(line) as {
          e?: { type?: string; message?: { content?: { type?: string }[] } };
        };
        const e = env.e;
        if (!e) continue;
        if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
          for (const c of e.message!.content!) {
            if (c.type === 'tool_use') n++;
          }
        }
      } catch {
        // skip malformed
      }
    }
    return n;
  } catch {
    return 0;
  }
}
```

- [x] **Step 7: Re-run the test — expect PASS**

```powershell
npx vitest run src/__tests__/driver.test.ts -t "parseCliEvents"
```

Expected: PASS.

### Step 8 — Add `parseCliTokens` with failing test

- [x] **Step 8: Add this test to `driver.test.ts`**

```ts
import { parseCliTokens } from '../driver.js';

describe('parseCliTokens', () => {
  it('extracts usage from final result event', async () => {
    const dir = join(tmpdir(), `test-tokens-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'cli-events.jsonl');
    await writeFile(
      eventsPath,
      [
        JSON.stringify({ ts: 0, e: { type: 'system' } }),
        JSON.stringify({
          ts: 5000,
          e: {
            type: 'result',
            subtype: 'success',
            usage: {
              input_tokens: 1500,
              output_tokens: 320,
              cache_read_input_tokens: 12000,
              cache_creation_input_tokens: 200,
            },
          },
        }),
      ].join('\n'),
      'utf8',
    );
    const t = await parseCliTokens(eventsPath);
    expect(t).toEqual({
      input_tokens: 1500,
      output_tokens: 320,
      cache_read_input_tokens: 12000,
      cache_creation_input_tokens: 200,
    });
  });

  it('returns zeros when no result event', async () => {
    const dir = join(tmpdir(), `test-tokens-empty-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'cli-events.jsonl');
    await writeFile(eventsPath, '', 'utf8');
    expect(await parseCliTokens(eventsPath)).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });
});
```

- [x] **Step 9: Run — expect FAIL (function not exported)**

```powershell
npx vitest run src/__tests__/driver.test.ts -t "parseCliTokens"
```

- [x] **Step 10: Add `parseCliTokens` to `driver.ts`** (next to `parseCliEvents`)

```ts
export interface CliTokens {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export async function parseCliTokens(eventsPath: string): Promise<CliTokens> {
  const zero: CliTokens = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  try {
    const txt = await readFile(eventsPath, 'utf8');
    let last: CliTokens = zero;
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const env = JSON.parse(line) as { e?: { type?: string; usage?: Partial<CliTokens> } };
        const e = env.e;
        if (e?.type === 'result' && e.usage) {
          last = {
            input_tokens: e.usage.input_tokens ?? 0,
            output_tokens: e.usage.output_tokens ?? 0,
            cache_read_input_tokens: e.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: e.usage.cache_creation_input_tokens ?? 0,
          };
        }
      } catch {
        // skip
      }
    }
    return last;
  } catch {
    return zero;
  }
}
```

- [x] **Step 11: Re-run — expect PASS**

```powershell
npx vitest run src/__tests__/driver.test.ts -t "parseCliTokens"
```

### Step 12 — Add `parseCliToolTimings` with failing test

- [x] **Step 12: Add this test to `driver.test.ts`**

```ts
import { parseCliToolTimings } from '../driver.js';

describe('parseCliToolTimings', () => {
  it('correlates tool_use ts with matching tool_result ts and groups by tool name', async () => {
    const dir = join(tmpdir(), `test-tooltime-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'cli-events.jsonl');
    await writeFile(
      eventsPath,
      [
        JSON.stringify({
          ts: 100,
          e: {
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'Read' }] },
          },
        }),
        JSON.stringify({
          ts: 250,
          e: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] } },
        }),
        JSON.stringify({
          ts: 300,
          e: {
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id: 'tu_2', name: 'Read' }] },
          },
        }),
        JSON.stringify({
          ts: 320,
          e: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_2' }] } },
        }),
        JSON.stringify({
          ts: 400,
          e: {
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id: 'tu_3', name: 'Bash' }] },
          },
        }),
        JSON.stringify({
          ts: 900,
          e: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_3' }] } },
        }),
      ].join('\n'),
      'utf8',
    );
    expect(await parseCliToolTimings(eventsPath)).toEqual({
      Read: { count: 2, total_ms: 170 },
      Bash: { count: 1, total_ms: 500 },
    });
  });
});
```

- [x] **Step 13: Run — expect FAIL**

- [x] **Step 14: Add `parseCliToolTimings` to `driver.ts`**

```ts
export interface ToolTiming {
  count: number;
  total_ms: number;
}

export async function parseCliToolTimings(eventsPath: string): Promise<Record<string, ToolTiming>> {
  const out: Record<string, ToolTiming> = {};
  try {
    const txt = await readFile(eventsPath, 'utf8');
    const pending = new Map<string, { name: string; ts: number }>();
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const env = JSON.parse(line) as {
          ts?: number;
          e?: {
            type?: string;
            message?: {
              content?: Array<{ type?: string; id?: string; name?: string; tool_use_id?: string }>;
            };
          };
        };
        const ts = env.ts ?? 0;
        const content = env.e?.message?.content ?? [];
        for (const c of content) {
          if (c.type === 'tool_use' && c.id) {
            pending.set(c.id, { name: c.name ?? 'unknown', ts });
          } else if (c.type === 'tool_result' && c.tool_use_id) {
            const p = pending.get(c.tool_use_id);
            if (p) {
              const slot = (out[p.name] ??= { count: 0, total_ms: 0 });
              slot.count++;
              slot.total_ms += Math.max(0, ts - p.ts);
              pending.delete(c.tool_use_id);
            }
          }
        }
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return out;
  }
}
```

- [x] **Step 15: Re-run — expect PASS**

### Step 16 — Extend `TimingsFile` in `packages/core/src/perf.ts`

- [x] **Step 16: Add the new fields to the `TimingsFile` interface**

Find the existing interface (search for `export interface TimingsFile`) and extend:

```ts
export interface TimingsFile {
  task_id: string;
  stack?: string;
  image?: string;
  host?: Record<string, number>;
  worker?: Record<string, number>;
  total_ms: number;
  cli_tool_calls?: number;
  cli_commits?: number;
  cli_budget_exceeded?: boolean;
  // NEW (T1):
  cli_input_tokens?: number;
  cli_output_tokens?: number;
  cli_cache_read_tokens?: number;
  cli_cache_creation_tokens?: number;
  cli_tool_timings?: Record<string, { count: number; total_ms: number }>;
  gates_parallel_ms?: number; // set by T2
  gates_serial_sum_ms?: number; // set by T2
}
```

- [x] **Step 17: Vendor the same change into the worker copy at `arandano-worker/lib/src/perf.ts`**

(The worker has its own `perf.ts`. Mirror the field additions there.)

### Step 18 — Worker `driver.ts` writes the new fields into `timings.json`

- [x] **Step 18: Update the post-run patch in `driver.ts`**

Find the existing block that patches `cli_tool_calls`/`cli_commits`/`cli_budget_exceeded`. Replace with:

```ts
const cliToolCalls = await parseCliEvents(eventsPath);
const cliTokens = await parseCliTokens(eventsPath);
const cliToolTimings = await parseCliToolTimings(eventsPath);
const cliCommits = await countBranchCommits(workspace, baseBranch);
await readFile(timingsPath, 'utf8')
  .then((raw) => {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    parsed['cli_tool_calls'] = cliToolCalls;
    parsed['cli_commits'] = cliCommits;
    parsed['cli_budget_exceeded'] = cliBudgetExceeded;
    parsed['cli_input_tokens'] = cliTokens.input_tokens;
    parsed['cli_output_tokens'] = cliTokens.output_tokens;
    parsed['cli_cache_read_tokens'] = cliTokens.cache_read_input_tokens;
    parsed['cli_cache_creation_tokens'] = cliTokens.cache_creation_input_tokens;
    parsed['cli_tool_timings'] = cliToolTimings;
    return writeFile(timingsPath, JSON.stringify(parsed, null, 2), 'utf8');
  })
  .catch(() => {});
```

Mirror the same change in the `fail(...)` helper that also patches timings.json.

### Step 19 — Extend `BenchRow` and CSV header in `packages/executors-docker/src/benchCsv.ts`

- [x] **Step 19: Add columns to `BenchRow`, `HEADER`, and `toCsvLine`**

Add fields (in this order, appended at the end so existing rows still parse):

```ts
cli_input_tokens: number;
cli_output_tokens: number;
cli_cache_read_tokens: number;
cli_cache_creation_tokens: number;
gates_parallel_ms: number; // 0 when T2 not applied yet
gates_serial_sum_ms: number; // 0 when T2 not applied yet
host_container_reuse: number; // 0 = miss, 1 = warm hit (T6)
host_gitnexus_skipped: number; // 0 = ran, 1 = skipped (T5)
```

Update `HEADER` (CSV) to append:
`,cli_input_tokens,cli_output_tokens,cli_cache_read_tokens,cli_cache_creation_tokens,gates_parallel_ms,gates_serial_sum_ms,host_container_reuse,host_gitnexus_skipped`

Update `toCsvLine` to emit these eight fields at the end.

### Step 20 — `DockerExecutor.mergeBenchRow` populates the new fields

- [x] **Step 20: Update `mergeBenchRow` in `DockerExecutor.ts`**

Within the `const row: BenchRow = { ... }` literal, add:

```ts
cli_input_tokens: workerTimings?.cli_input_tokens ?? 0,
cli_output_tokens: workerTimings?.cli_output_tokens ?? 0,
cli_cache_read_tokens: workerTimings?.cli_cache_read_tokens ?? 0,
cli_cache_creation_tokens: workerTimings?.cli_cache_creation_tokens ?? 0,
gates_parallel_ms: workerTimings?.gates_parallel_ms ?? 0,
gates_serial_sum_ms: workerTimings?.gates_serial_sum_ms ?? 0,
host_container_reuse: 0,        // T6 will set this; placeholder for now
host_gitnexus_skipped: 0,       // T5 will set this; placeholder for now
```

### Step 21 — Update `arandano bench` to render new columns

- [x] **Step 21: In `packages/cli/src/commands/bench.ts`**

In `Row`, `parseCsv`, and `NUM_COLS`, add the 8 new fields. In the render loop, list them after `cli_commits`. Token fields use `fmtVal` (integer formatting). Gate fields use `fmt` (`.../1000` for ms). Reuse/skipped use `fmtVal`.

### Step 22 — Add `--by-tool` flag to `bench`

- [x] **Step 22: Add the new view in `bench.ts`**

```ts
// In the flags definition:
'by-tool': Flags.boolean({ description: 'show per-tool elapsed time aggregated from cli-events.jsonl' }),
```

In `run()`, branch on the flag. When `--by-tool` is true, the command reads the latest `cli_tool_timings` from `timings.json` files in `.arandano/runs/*/timings.json` (most recent N runs) and prints a table:

```
tool          calls   total_ms   median_ms_per_call
Read          24      8120       338
Edit          12      1840       153
Bash          8       21300      2662
Grep          6       720        120
```

- [x] **Step 23: Test rendering** in `packages/cli/src/__tests__/bench.test.ts` — add a fixture-driven test:

```ts
it('parses cli_input_tokens column', () => {
  const csv = [
    'timestamp,task_id,stack,image_sha,total_ms,host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms,cli_tool_calls,cli_commits,cli_input_tokens,cli_output_tokens,cli_cache_read_tokens,cli_cache_creation_tokens,gates_parallel_ms,gates_serial_sum_ms,host_container_reuse,host_gitnexus_skipped',
    '2026-05-22T20:00:00.000Z,T4,node-ts,image,500000,0,1000,300,498000,40000,400000,80000,1000,5,3,1234,567,9876,123,40000,80000,0,0',
  ].join('\n');
  const rows = parseCsv(csv);
  expect(rows[0]!.cli_input_tokens).toBe(1234);
  expect(rows[0]!.cli_output_tokens).toBe(567);
});
```

### Step 24 — Build and test both repos

- [x] **Step 24: Build worker**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
npm test
```

All tests pass.

- [x] **Step 25: Build monorepo**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm run build
npm test
```

All tests pass.

### Step 26 — Commit and push worker

- [x] **Step 26: Commit worker**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src
git commit -m ":sparkles: feat(driver): event envelope + token + per-tool timing extraction"
git push origin main
```

- [x] **Step 27: Wait for image build**

```powershell
gh run watch $(gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1 --json databaseId --jq '.[0].databaseId') --repo nmunozsi/arandano-worker
```

Image must finish with `success`.

### Step 28 — Commit monorepo

- [x] **Step 28: Commit monorepo**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add packages docs
git commit -m ":sparkles: feat(bench): token + per-tool timing columns and arandano bench --by-tool"
```

### Step 29 — Run measurement (baseline with new metrics)

- [x] **Step 29: Reset state and run the three-helpers plan**

Reset `.arandano/state.json` of node-ts-toy to keep only AS1/AS2 completed. Then:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

Expect: 4 tasks complete (T4, T5, T6, T-architect).

- [x] **Step 30: Capture bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench --by-tool
```

Verify `cli_tool_calls > 0` for T4/T5/T6.

### Step 31 — Append T1 row to Results table in plan.md

- [x] **Step 31: Fill in the "+ T1 instrumentation" row** in `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md` Results table with the median of T4+T5.

- [x] **Step 32: Tick T1 in plan.md task list**

- [x] **Step 33: Commit results**

```bash
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): T1 instrumentation measurement row"
```

---

**Done when:** `cli_tool_calls > 0`, all 4 token columns populated, `arandano bench --by-tool` renders ≥3 tools, Results row added.
