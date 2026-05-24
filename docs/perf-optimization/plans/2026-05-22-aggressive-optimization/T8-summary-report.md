> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T8-summary-report.md`
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
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md                             ← you are here
> ```

## Task 8: Summary report + ≥40% target check + Phase 5 framing

**Goal:** Aggregate the Results table, decide whether the ≥45% target (≥40% from baseline, plan's primary acceptance bar) was met, and document the next phase's candidates.

**Files:**

- Modify: `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md` — fill in Conclusion subsection.

---

### Step 1 — Verify the Results table is complete

- [ ] **Step 1: Open `plan.md` and confirm every row has real numbers (no TBDs)**

The Results table should have rows: Baseline, +T1, +T2, +T3, +T4, +T5, +T6 — seven rows total.

If any row is still TBD: that task wasn't measured. Go back and run the measurement for that task before proceeding.

### Step 2 — Compute the cumulative delta

- [ ] **Step 2: Compare final row to baseline**

```
delta_total_ms = baseline_total_ms - final_total_ms
delta_percent = 100 * delta_total_ms / 1006005  // vs original Phase 3 baseline
```

`1006005` is the original baseline median (1,006s — from Phase 3 baseline).

### Step 3 — Classify outcome against acceptance bars

- [ ] **Step 3: Decide outcome**

- **≤450s (≥55%)**: stretch target hit.
- **≤550s (≥45%)**: primary acceptance bar hit.
- **≤604s (≥40%)**: original ≥40% target hit (Phase 3's original target).
- **>604s (<40%)**: target missed; document why and propose Phase 5.

### Step 4 — Identify Phase 5 candidates

- [ ] **Step 4: Compile candidate list**

Pull from:

- T7 finding (if Outcome 2 or 3): direct-API integration with explicit `cache_control`.
- T5 (if mtime safeguard wasn't needed but discovery suggested deeper gitnexus improvements): smarter analyze granularity.
- Any T3b deferral (`--disallowed-tools` unavailable in CLI): re-evaluate when CLI updates.
- Container pool refinements: keyed-by-image-and-stack pooling, persistent across CLI sessions.
- Multi-provider CLI selection (was the original "Phase 4"; now still candidate for next spec).
- Coverage delta as gate; security gate as required.

### Step 5 — Write the Conclusion in plan.md

- [ ] **Step 5: Replace the placeholder Conclusion in `plan.md`** with:

```markdown
### Conclusion

**Date:** 2026-05-22 (or actual date)

- **Baseline (post-Phase 3):** 1,006s per task (median of T4+T5, N=2).
- **Final (post-Phase 4):** TBD seconds per task (median of T4+T5 after T6 measurement).
- **Cumulative reduction:** TBD% — [stretch hit / primary bar hit / ≥40% hit / target missed].

**Per-improvement contribution (best estimate from Results table):**

| Improvement          | Δ total_ms | Notes                                              |
| -------------------- | ---------- | -------------------------------------------------- |
| T2 parallelize gates | TBD        | gates_parallel_ms / gates_serial_sum_ms ratio: TBD |
| T3 F + tool trim     | TBD        | cli_tool_calls dropped from TBD → TBD per task     |
| T4 inline content    | TBD        | Read-tool calls dropped further                    |
| T5 gitnexus surfaced | TBD        | cache_hit on tasks 2+ visible in bench             |
| T6 container pool    | TBD        | warm-hit savings on T6 (after T4 ends)             |

**T7 prompt caching:** [Outcome 1 / 2 / 3] — see "T7 — Prompt caching audit (finding)" above.

**Phase 5 candidates (in priority order):**

1. TBD (e.g., direct-API integration if T7 Outcome 2/3)
2. TBD (e.g., multi-provider CLI selection)
3. TBD

**Notes on any deferred or skipped sub-tasks:**

- TBD (e.g., T3b `--disallowed-tools` was deferred because the deployed CLI version did not support the flag.)
```

Replace every TBD with real values from the Results table.

### Step 6 — Tick remaining exit criteria

- [ ] **Step 6: Go through the exit criteria in plan.md**

Every checkbox should be `[x]` except deferrals you explicitly documented in the Conclusion. Tick anything still unticked.

### Step 7 — Tick T8 checkbox and commit

- [ ] **Step 7: Tick T8 in the Tasks list**

- [ ] **Step 8: Final commit**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): perf-optimization phase 4 summary — TBD% reduction"
```

(Replace TBD with the real number before committing. Subject must remain lowercase per commitlint.)

---

**Done when:** Conclusion filled with real numbers, exit criteria all `[x]` (or explicitly deferred in writing), T8 checkbox ticked, final commit landed.
