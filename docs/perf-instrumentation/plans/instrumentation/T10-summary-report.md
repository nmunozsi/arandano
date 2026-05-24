> **Location:** `docs/perf-instrumentation/plans/instrumentation/T10-summary-report.md`
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
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md                                             ← you are here
> ```

## Task 10: Summary report

**Goal:** Fill in the Results section of `plan.md` with the final measured deltas across T7, T8, and T9. Record whether the ≥40% wall-time target was met, and if not, explain what remains.

---

- [ ] **Step 1: Generate the final bench output**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench --last 12
```

Capture the output. Identify the median rows for: baseline runs (before T7), T7 post-run, T8 post-run.

- [ ] **Step 2: Fill in the Results section in `plan.md`**

Append (or replace the TBD table from T8) with:

```markdown
## Results

### Per-improvement deltas (median of two tasks per run)

| Step             | total_ms | worker_install_ms | worker_cli_ms | worker_gates_ms | cli_tool_calls | cli_commits |
| ---------------- | -------- | ----------------- | ------------- | --------------- | -------------- | ----------- |
| Baseline (T5–T6) | TBD      | TBD               | TBD           | TBD             | (unavailable)  | (unavail.)  |
| + T7 instrument  | TBD      | TBD               | TBD           | TBD             | TBD            | TBD         |
| + T8 optimiz.    | TBD      | TBD               | TBD           | TBD             | TBD            | TBD         |

### Conclusion

- Per-task wall time: baseline = X min → final = Y min. **Achieved Z% reduction** (target ≥40%).
- `cli_tool_calls` per task: TBD (provides ongoing visibility into Claude efficiency).
- `cli_commits` per task: TBD (rework loop indicator; >2 commits for a simple task signals prompt or context issue).
- If ≥40% target was not met: explain which phases remain dominant and propose next plan's focus.
```

Replace every TBD with real numbers.

- [ ] **Step 3: Verify exit criteria**

Go through the exit criteria checklist in `plan.md` and confirm each item is `[x]`. Items likely still open:

- `Phases 4-9 plan files renamed; cross-references updated` — verify or rename.
- `Per-task wall time dropped ≥40% OR Results section explains why` — fill in the conclusion.

- [ ] **Step 4: Commit**

```bash
git add docs/perf-instrumentation/plans/instrumentation/plan.md
git commit -m ":memo: docs(plans): Phase 3 results — Z% wall-time reduction"
```

(Replace Z with the real number.)

---
