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

## Task 7: CLI instrumentation — stream-json, tool_call_count, commit_count

**Goal:** Wire `--output-format stream-json` into the worker's Claude invocation. After each CLI run, parse the event stream to extract `cli_tool_calls` and `cli_commits`, surface both in `timings.json`, `bench.csv`, and `arandano bench`. This provides the visibility foundation needed to measure the impact of T8 optimizations.

**Files:**

- Modify: `arandano-worker/lib/src/driver.ts` — switch to stream-json, save events, parse counts
- Modify: `packages/core/src/perf.ts` — add `cli_tool_calls`, `cli_commits`, `cli_budget_exceeded` to `TimingsFile`
- Modify: `packages/executors-docker/src/benchCsv.ts` — add `cli_tool_calls` and `cli_commits` columns
- Modify: `packages/executors-docker/src/DockerExecutor.ts` — read new fields from merged timings
- Modify: `packages/cli/src/commands/bench.ts` — display new columns

---

- [ ] **Step 1: Extend `TimingsFile` in `packages/core/src/perf.ts`**

Add three optional fields to the `TimingsFile` interface (the third is a placeholder used by T9):

```ts
export interface TimingsFile {
  task_id: string;
  stack?: string;
  image?: string;
  host?: Record<string, number>;
  worker?: Record<string, number>;
  total_ms: number;
  cli_tool_calls?: number; // count of tool_use events from stream-json
  cli_commits?: number; // commits on agent branch beyond base
  cli_budget_exceeded?: boolean; // set by T9
}
```

- [ ] **Step 2: Switch `invokeCli` to `--output-format stream-json` in `driver.ts`**

The stream-json format writes one JSON object per newline to stdout. Key event shapes:

```jsonc
{ "type": "tool_use", "name": "Read", "input": { ... } }     // one per tool call
{ "type": "result", "subtype": "success", "result": "..." }  // final summary
```

**Implementation:**

1. Add `--output-format stream-json` to the args passed to `invokeCli`.
2. Pipe stdout to `{runFolder}/cli-events.jsonl` in addition to memory (or write line-by-line as events arrive).
3. After the process exits, read the final `type: "result"` event and use its `result` field for the journal summary — replaces the current first-2000-chars approach.

```ts
// After invokeCli() returns:
const eventsRaw = await readFile(`${runFolder}/cli-events.jsonl`, 'utf8').catch(() => '');
const events = eventsRaw
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l) as { type: string };
    } catch {
      return null;
    }
  })
  .filter(Boolean) as { type: string }[];

const cliToolCalls = events.filter((e) => e.type === 'tool_use').length;
```

**Fallback:** If the installed Claude version does not support `--output-format stream-json` (process exits non-zero with a usage error), catch the error and retry with `--output-format text`. Log `[warn] stream-json unavailable; cli_tool_calls will be 0` to the journal.

- [ ] **Step 3: Count commits on the agent branch**

After the CLI phase succeeds, count how many commits are on the agent branch beyond the base branch:

```ts
async function countBranchCommits(baseBranch: string): Promise<number> {
  const out = await runShell(`git log --oneline ${baseBranch}..HEAD`);
  const lines = out.trim().split('\n').filter(Boolean);
  return lines.length;
}
```

- [ ] **Step 4: Write counts into `timings.json`**

After `perf.writeTimingsJson()` writes the initial file, patch it with the new fields:

```ts
const timingsPath = `${runFolder}/timings.json`;
await perf.writeTimingsJson(timingsPath, { taskId, side: 'worker', stack, image });

// Patch with CLI-level metrics
const timingsJson = JSON.parse(await readFile(timingsPath, 'utf8'));
timingsJson.cli_tool_calls = cliToolCalls;
timingsJson.cli_commits = await countBranchCommits(baseBranch);
await writeFile(timingsPath, JSON.stringify(timingsJson, null, 2), 'utf8');
```

Apply the same patch in the `fail()` path (best-effort, `.catch(() => {})`).

- [ ] **Step 5: Add columns to `benchCsv.ts`**

```ts
export interface BenchRow {
  // ... existing fields ...
  cli_tool_calls: number;
  cli_commits: number;
}

const HEADER =
  'timestamp,task_id,stack,image_sha,total_ms,' +
  'host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,' +
  'worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms,' +
  'cli_tool_calls,cli_commits';
```

Update `rowToCsv()` to append the two new fields.

- [ ] **Step 6: Read new fields in `DockerExecutor.mergeBenchRow()`**

```ts
cli_tool_calls: merged.cli_tool_calls ?? 0,
cli_commits: merged.cli_commits ?? 0,
```

- [ ] **Step 7: Display new columns in `arandano bench`**

Add `cli_tool_calls` and `cli_commits` to the bench output. These are counts, not durations — format them as plain integers (no `ms` suffix). Add a check: if the column name does not end in `_ms`, format as `n.toLocaleString()` instead of the duration formatter.

- [ ] **Step 8: Tests**

- Add a unit test for the event-parsing logic with a synthetic `cli-events.jsonl` fixture (a few tool_use lines + one result line).
- Update `DockerExecutor.test.ts`: supply a merged timings fixture that includes `cli_tool_calls` and `cli_commits`, assert the bench row picks them up.
- Run `npm test` — green.

- [ ] **Step 9: Build, push worker image, re-measure**

```powershell
# Worker build + push
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
git add -A
git commit -m ":zap: perf(driver): capture stream-json events for cli_tool_calls and cli_commits"
git push origin main
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
# Wait for green

# Host build
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm run build
```

Reset node-ts-toy state (keep T1, clear T4/T5), then run:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=2026-05-11-three-helpers --no-architect
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

Verify: `cli_tool_calls` and `cli_commits` columns appear in bench output with non-zero values.

- [ ] **Step 10: Commit host-side changes**

```bash
git add packages/core/src/perf.ts \
         packages/executors-docker/src/benchCsv.ts \
         packages/executors-docker/src/DockerExecutor.ts \
         packages/cli/src/commands/bench.ts
git commit -m ":zap: perf(instrumentation): add cli_tool_calls and cli_commits to timings and bench"
```

---
