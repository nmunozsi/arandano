> **Location:** `docs/perf-instrumentation/plans/instrumentation/T5-baseline-measurement.md`
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
> ├── T5-baseline-measurement.md                                        ← you are here
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 5: Baseline measurement

**Goal:** Run the three-helpers plan with instrumentation in place and capture the resulting `bench.csv`. Commit it as a snapshot for future diffing.

**Prerequisites:** Worker image rebuild from Task 2 has finished (verify with `gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1`).

- [ ] **Step 1: Reset the node-ts-toy state to a clean baseline**

In `arandano-examples/node-ts-toy/.arandano/state.json`, keep only T1 (the prior completed task). Remove any T4/T5/T6 entries.

```json
{
  "tasks": {
    "T1": {
      "retry_count": 0,
      "status": "completed",
      "started_at": "2026-05-13T02:00:20.721Z",
      "finished_at": "2026-05-13T02:11:37.307Z"
    }
  }
}
```

- [ ] **Step 2: Remove any pre-existing `bench.csv` so the baseline starts fresh**

```bash
rm -f ../arandano-examples/node-ts-toy/.arandano/bench.csv
```

(Path is relative to the arandano monorepo root. On PowerShell: `Remove-Item -Force -ErrorAction Ignore "..\arandano-examples\node-ts-toy\.arandano\bench.csv"`.)

- [ ] **Step 3: Run the plan**

From a PowerShell terminal where `ANTHROPIC_API_KEY` and `GH_TOKEN` are set:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=2026-05-11-three-helpers
```

Expected: T4 and T5 run in parallel; T6 follows; three PRs opened; `.arandano/bench.csv` now exists with 3 rows.

- [ ] **Step 4: Inspect the baseline**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

Expected: a 12-row table (one row per phase) showing median, p95, last, and Δ-vs-prev across T4/T5/T6.

- [ ] **Step 5: Save the baseline snapshot in the arandano repo**

Copy the baseline CSV into the arandano repo under a stable name so future improvements can be diffed against it.

```bash
mkdir -p docs/bench
cp ../arandano-examples/node-ts-toy/.arandano/bench.csv docs/bench/baseline-three-helpers.csv
```

- [ ] **Step 6: Commit**

```bash
git add docs/bench/baseline-three-helpers.csv
git commit -m "chore(bench): record baseline timings for three-helpers plan"
```

---
