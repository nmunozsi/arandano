> **Location:** `docs/perf-instrumentation/plans/instrumentation/T6-re-brainstorm-based-on-baseline-data.md`
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
> ├── T6-re-brainstorm-based-on-baseline-data.md                        ← you are here
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 6: Decision gate — revised improvements (no code)

**Status: COMPLETE** (2026-05-22)

**Goal:** Use the baseline measurements to confirm, drop, or replace the three tentative improvements and produce a written addendum in `plan.md`. The addendum at the bottom of `plan.md` is the deliverable; T7–T9 implement that list.

---

- [x] **Step 1: Read the baseline**

```bash
cat docs/bench/baseline-three-helpers.csv
```

Baseline (`docs/bench/baseline-three-helpers.csv`, N=2 runs: T4 and T5 of three-helpers):

| Phase             | T4 (ms)   | T5 (ms) | Median (ms) | % of total |
| ----------------- | --------- | ------- | ----------- | ---------- |
| total_ms          | 1,057,110 | 954,901 | 1,006,005   | 100%       |
| host_pull_ms      | 1,345     | 1,336   | 1,341       | 0.1%       |
| host_clone_ms     | 518       | 519     | 519         | 0.1%       |
| host_wait_ms      | 1,054,772 | 952,528 | 1,003,650   | 99.8%      |
| worker_install_ms | 64,482    | 64,200  | 64,341      | 6.4%       |
| worker_cli_ms     | 686,578   | 601,840 | 644,209     | 64.0%      |
| worker_gates_ms   | 299,391   | 281,562 | 290,477     | 28.9%      |
| worker_push_ms    | 1,417     | 2,041   | 1,729       | 0.2%       |

- [x] **Step 2: Classify original improvements**

| Improvement        | Target column     | % of total | Decision |
| ------------------ | ----------------- | ---------- | -------- |
| A — npm cache      | worker_install_ms | 6.4%       | CONFIRM  |
| B — skip pull      | host_pull_ms      | 0.1%       | DROP     |
| C — pre-bake tools | worker_install_ms | 6.4%       | DROP     |

Rationale:

- **A confirmed** — 6.4% is above the 5% threshold; a warm npm cache eliminates most of install time.
- **B dropped** — 0.1% is negligible. Not worth the digest-comparison complexity.
- **C dropped** — Overlaps with A and doesn't address the real bottleneck (`worker_cli_ms`).

- [x] **Step 3: Identify unexpected large costs**

`worker_cli_ms` at 64% is far larger than anticipated. Two observations from the baseline runs:

1. Both tasks made **4 commits** instead of the minimum 2 — Claude hit a rework loop (vitest coverage config fix + greet test for coverage threshold). Each extra iteration costs API round trips.
2. Claude must discover the codebase structure via tool calls on every run; there is no pre-injected context.

New improvements identified:

- **D (parallelize quality gates)** — `worker_gates_ms` = 29% of total. Sequential gates (format → lint → typecheck → test → coverage → commitMsg) could run in parallel, cutting this from ~290s to ~60–80s (~21% total savings).
- **E (per-task model selection)** — A faster, cheaper model (e.g., Haiku) for simple add-helper tasks could cut `worker_cli_ms` significantly. Requires `model:` frontmatter.
- **F (selective context injection)** — Pre-injecting known source files into the prompt reduces Claude's file-discovery tool calls. Requires `inject_context:` frontmatter.

**Note on ≥40% target:** Eliminating all of `worker_install_ms` + `worker_gates_ms` saves only ~35%. Reaching ≥40% requires reducing `worker_cli_ms`, which is why E and F are critical. Parallelizing gates (D) is deferred to Phase 4 (moderate complexity); E and F are pursued in T8.

- [x] **Step 4: Write the addendum to `plan.md`**

The addendum "Improvements to pursue (chosen at T6 on 2026-05-22)" is written at the bottom of `plan.md`. Revised approach is a three-layer system:

1. Instrumentation (T7)
2. Optimizations: A + E + F (T8)
3. Control: cli_budget_ms (T9)

- [x] **Step 5: Commit**

The addendum is committed as part of the plan.md update that also marks T5/T6 complete and rewrites T7–T9 task files.

---
