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

## Task 6: Re-brainstorm based on baseline data (decision gate, no code)

**Goal:** Use the baseline measurements to confirm, drop, or replace the three tentative improvements. The output is a written addendum at the bottom of this plan; T7+ then implement that list.

**Files:**

- Modify: `docs/plans/2026-05-14-phase-3-performance.md` (append the addendum section)

- [ ] **Step 1: Read the baseline**

```bash
cat docs/bench/baseline-three-helpers.csv
```

For each row, compute (or just eyeball from `arandano bench`) what share each phase contributes to `total_ms`.

- [ ] **Step 2: For each tentative improvement, classify it**

For each of A (npm cache volume), B (skip docker pull), C (pre-bake gate tools):

- **CONFIRM** — the affected phase is >5% of total in the median row. Keep as-is in T7/T8/T9.
- **MODIFY** — the affected phase is >5% but the proposed fix is unlikely to recoup most of it. Note the modified approach.
- **DROP** — the affected phase is ≤5% of total. The improvement is not worth the dev cost. Replace with a new candidate.

Mapping from improvement to its target column:

| Improvement        | Target column(s)                     |
| ------------------ | ------------------------------------ |
| A — npm cache      | `worker_install_ms`                  |
| B — skip pull      | `host_pull_ms`                       |
| C — pre-bake tools | `worker_install_ms` (and overlaps A) |

- [ ] **Step 3: Look for unexpected large costs**

For each phase that contributes >10% of total and isn't already targeted by A/B/C, write a one-line note describing what could reduce it. Common candidates to consider:

- `host_wait_ms` (Claude CLI runtime is most of this; little leverage)
- `worker_cli_ms` (same as above — model latency and tool-call count)
- `worker_gates_ms` (parallel gates were de-scoped, but could be reinstated)
- `host_clone_ms` (could use `git worktree` instead of `clone --local`)
- `worker_push_ms` (gh PR create latency)

- [ ] **Step 4: Append the addendum to this plan**

Add the following section at the bottom of `docs/plans/2026-05-14-phase-3-performance.md` (before any horizontal rule that ends the file):

```markdown
---

## Improvements to pursue (chosen at T6 on YYYY-MM-DD)

**Baseline (median across T4/T5/T6):**

| Phase             | ms     | % of total |
| ----------------- | ------ | ---------- |
| total_ms          | XXXXXX | 100%       |
| host_pull_ms      | XXXX   | X%         |
| host_clone_ms     | XXXX   | X%         |
| host_wait_ms      | XXXXXX | X%         |
| worker_install_ms | XXXXXX | X%         |
| worker_cli_ms     | XXXXXX | X%         |
| worker_gates_ms   | XXXX   | X%         |
| worker_push_ms    | XXXX   | X%         |

**Decisions:**

- **A (npm cache volume)** — CONFIRM / MODIFY / DROP. Rationale: …
- **B (skip docker pull)** — CONFIRM / MODIFY / DROP. Rationale: …
- **C (pre-bake gate tools)** — CONFIRM / MODIFY / DROP. Rationale: …

**Newly identified improvements (if any):**

- D — <name>: <target phase>, <expected savings>, <approach>.

**Final ordered list for T7/T8/T9:**

1. …
2. …
3. …
```

Fill in every `XXX` and `…`. No placeholders left.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-05-14-phase-3-performance.md
git commit -m "docs(plans): T6 decision gate — confirm improvements based on baseline"
```

---
