> **Location:** `docs/perf-instrumentation/plans/instrumentation/T9-improvement-c-pre-bake-gate-tools-in-worker-image.md`
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
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md           ← you are here
> └── T10-summary-report.md
> ```

## Task 9: Control — cli_budget_ms + bench visualization

**Goal:** Add a lightweight control mechanism that surfaces when a task's Claude CLI invocation exceeds a declared budget. This prevents unnoticed drift — if a future task starts taking 20 min where it used to take 10 min, `arandano bench` will flag it immediately.

**Files:**

- Modify: `packages/core/src/types/` — add `cli_budget_ms` to `TaskFrontmatter` (already scaffolded in T8 B.1)
- Modify: `packages/core/src/runOne.ts` — pass `ARANDANO_CLI_BUDGET_MS` to container
- Modify: `packages/executors-docker/src/containerSpec.ts` — include in env vars
- Modify: `arandano-worker/lib/src/driver.ts` — compare actual cli_ms against budget, set flag
- Modify: `packages/executors-docker/src/DockerExecutor.ts` — log warning when budget exceeded
- Modify: `packages/cli/src/commands/bench.ts` — mark over-budget rows visually

---

- [ ] **Step 1: `cli_budget_ms` frontmatter field**

If not already added in T8 B.1, add to `TaskFrontmatter`:

```ts
cli_budget_ms?: number; // optional; warn if worker_cli_ms exceeds this
```

- [ ] **Step 2: Pass budget to container in `runOne.ts`**

```ts
const cliBudgetMs = taskMd.frontmatter.cli_budget_ms;
// In the env passed to containerSpec:
if (cliBudgetMs !== undefined) {
  env['ARANDANO_CLI_BUDGET_MS'] = String(cliBudgetMs);
}
```

- [ ] **Step 3: Worker checks budget in `driver.ts`**

After the CLI phase completes and `perf` has recorded `cli_ms`, check the budget:

```ts
const cliBudgetMs = process.env.ARANDANO_CLI_BUDGET_MS
  ? Number(process.env.ARANDANO_CLI_BUDGET_MS)
  : undefined;

const actualCliMs = perf.asObject()['cli'] ?? 0;
const budgetExceeded = cliBudgetMs !== undefined && actualCliMs > cliBudgetMs;

if (budgetExceeded) {
  console.warn(
    `[arandano] cli_budget_ms exceeded: actual=${actualCliMs}ms budget=${cliBudgetMs}ms`,
  );
}
```

When patching `timings.json` (from T7 Step 4), also set:

```ts
if (budgetExceeded) timingsJson.cli_budget_exceeded = true;
```

- [ ] **Step 4: Host logs a warning when budget is exceeded**

In `DockerExecutor.mergeBenchRow()`, after reading the merged timings:

```ts
if (merged.cli_budget_exceeded) {
  console.warn(
    `[arandano] Task ${opts.taskId}: cli_budget_ms exceeded (worker_cli_ms=${merged.worker?.['cli'] ?? '?'}ms)`,
  );
}
```

This surfaces in the host console output during `arandano run`.

- [ ] **Step 5: `arandano bench` marks over-budget rows**

In `packages/cli/src/commands/bench.ts`, read a `cli_budget_exceeded` column from the CSV (if present — add it to `BenchRow` as optional boolean-as-string `'true'|'false'`).

When printing the `worker_cli_ms` cell for a run where `cli_budget_exceeded === 'true'`, append ` [!]` to the value.

Alternatively (simpler): keep `cli_budget_exceeded` in `timings.json` only and not in bench.csv. The warning log from Step 4 is sufficient for now. Bench.csv can gain the column in a later iteration.

- [ ] **Step 6: Document the workflow**

Add a short section to `docs/perf-instrumentation/spec.md` under a new "## Budget control" heading:

````markdown
## Budget control

Tasks may declare an optional `cli_budget_ms` in their frontmatter:

```yaml
---
tdd: strict
model: claude-haiku-4-5-20251001
cli_budget_ms: 300000 # 5 minutes
---
```
````

When `worker_cli_ms` exceeds this value, the worker logs a warning in the journal and sets `cli_budget_exceeded: true` in `timings.json`. The host echoes the warning to the console during `arandano run`. `arandano bench` marks the row with `[!]`.

The budget is advisory — it does not fail or abort the run. It exists to detect drift.

````

- [ ] **Step 7: Tests**

- Unit-test the budget check logic in `driver.ts` (mock `perf.asObject()` returning a value above/below threshold).
- Add a test in `DockerExecutor.test.ts` that supplies a timings fixture with `cli_budget_exceeded: true` and asserts the warning is logged.
- Run `npm test` — green.

- [ ] **Step 8: Build and push**

```powershell
# Worker
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
git add -A
git commit -m ":wrench: chore(driver): cli_budget_ms check and timings flag"
git push origin main
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1

# Host
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm test
npm run build
````

- [ ] **Step 9: Smoke-test with a budget**

Add `cli_budget_ms: 1` (1 ms, always-exceeded) to one task in the three-helpers plan temporarily, run it, and verify the `[arandano] cli_budget_ms exceeded` warning appears in the console output. Revert the frontmatter after confirming.

- [ ] **Step 10: Commit host-side changes**

```bash
git add packages/core/src/runOne.ts \
         packages/core/src/types/ \
         packages/executors-docker/src/DockerExecutor.ts \
         packages/cli/src/commands/bench.ts \
         docs/perf-instrumentation/spec.md
git commit -m ":sparkles: feat(core): cli_budget_ms advisory control with over-budget warnings"
```

---
