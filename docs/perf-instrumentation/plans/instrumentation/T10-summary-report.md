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

**Goal:** Update this plan with the final Results table and the conclusion of whether the ≥40% wall-time target was met.

**Files:**

- Modify: `docs/plans/2026-05-14-phase-3-performance.md`

- [ ] **Step 1: Generate a final summary**

```bash
node packages/cli/dist/bin.js bench --last 12
```

Capture the output.

- [ ] **Step 2: Fill in the Results section**

Make the Results section in `docs/plans/2026-05-14-phase-3-performance.md` complete:

```markdown
## Results

### Per-improvement deltas (median of 3 tasks)

| Step            | total_ms  | worker_install_ms | host_pull_ms | worker_gates_ms |
| --------------- | --------- | ----------------- | ------------ | --------------- |
| Baseline        | XXX       | XXX               | XXX          | XXX             |
| + Improvement A | XXX (-Y%) | XXX (-Y%)         | XXX          | XXX             |
| + Improvement B | XXX (-Y%) | XXX               | XXX (-Y%)    | XXX             |
| + Improvement C | XXX (-Y%) | XXX (-Y%)         | XXX          | XXX             |

### Conclusion

- Per-task wall time: baseline = X min, final = Y min. **Target was ≥40% reduction; achieved Z%.**
- 3-task plan wall time: baseline = X min, final = Y min.
- If target was not met: <one-paragraph explanation of which phases are still the dominant cost and what the next plan should attack.>
```

Replace every `XXX` and `Y` with real numbers. No placeholders.

- [ ] **Step 3: Update the Phase 2 plan's footer**

In `docs/plans/2026-05-08-phase-2-dag-reviewer-python-go.md` (the most recent already-renamed reference in Phase 4-or-later if Task 0 renamed it), confirm the cross-reference to "Phase 3" points to performance, not the renumbered Phase 4.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-05-14-phase-3-performance.md
git commit -m "docs(plans): Phase 3 results — Z% wall-time reduction"
```

---
