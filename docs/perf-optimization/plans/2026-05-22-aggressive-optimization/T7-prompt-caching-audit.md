> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T7-prompt-caching-audit.md`
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
> ├── T7-prompt-caching-audit.md                       ← you are here
> └── T8-summary-report.md
> ```

## Task 7: Prompt caching audit (investigation only)

**Goal:** Determine whether the Claude Code CLI is using Anthropic's prompt-caching feature. Token columns from T1 (`cli_cache_read_tokens`, `cli_cache_creation_tokens`) are the data source. Outcome is a written finding in `plan.md` — no code changes.

**Possible outcomes:**

1. **Cache hits dominate** (`cache_read / (cache_read + cache_creation + input) > 0.5`): caching is already working; no action needed.
2. **Cache misses dominate** (`cache_creation > 0` but `cache_read ≈ 0`): cache is being created but not reused across turns. File an upstream issue and document workarounds for Phase 5.
3. **Cache not present** (`cache_read == 0 && cache_creation == 0`): CLI is not setting `cache_control` at all. Direct Anthropic API would be required — deferred to a future spec.

**Files:**

- Modify: `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md` — append a "T7 finding" subsection.

---

### Step 1 — Aggregate token data across recent runs

- [ ] **Step 1: Pull token columns from bench.csv**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node -e "
const fs = require('fs');
const text = fs.readFileSync('.arandano/bench.csv', 'utf8').replace(/\r/g, '');
const lines = text.trim().split('\n');
const header = lines[0].split(',');
const idx = (col) => header.indexOf(col);
const cols = ['task_id','cli_input_tokens','cli_output_tokens','cli_cache_read_tokens','cli_cache_creation_tokens'];
console.log(cols.join('\t'));
for (let i = lines.length - 6; i < lines.length; i++) {
  const r = lines[i].split(',');
  console.log(cols.map(c => r[idx(c)]).join('\t'));
}
"
```

Capture the output. Should show the last ~6 runs (T4/T5/T6 from T1 baseline measurement + T2/T3/T4/T5/T6 measurements).

### Step 2 — Compute cache hit ratio

- [ ] **Step 2: Compute per-task ratio**

For each row, compute:

```
cache_hit_ratio = cache_read / (input + cache_read + cache_creation)
```

Record these values in a small table (this lives in the plan.md addendum below).

### Step 3 — Inspect a single `cli-events.jsonl` for raw `result` event

- [ ] **Step 3: Look at the full result event**

```powershell
$run = Get-ChildItem ".arandano/runs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content "$($run.FullName)/cli-events.jsonl" | Select-Object -Last 3
```

Pretty-print the last few lines. The `result` event should look like:

```json
{"ts":NNN,"e":{"type":"result","subtype":"success","usage":{"input_tokens":N,"output_tokens":N,"cache_read_input_tokens":N,"cache_creation_input_tokens":N},"...":""}}
```

Note the actual values. If `cache_read_input_tokens` and `cache_creation_input_tokens` are both absent from the event (not just zero), that's diagnostic — the CLI version may not emit them.

### Step 4 — Classify the finding

- [ ] **Step 4: Decide outcome**

Apply the classification:

- If median `cache_hit_ratio > 0.5`: **Outcome 1 — already cached**.
- If `cache_creation > 0` consistently and `cache_read` is consistently low: **Outcome 2 — cache created not reused**.
- If both are zero/absent: **Outcome 3 — no cache_control**.

### Step 5 — Write the finding into plan.md

- [ ] **Step 5: Append to `plan.md`** (under the Results section, before the Conclusion line)

```markdown
### T7 — Prompt caching audit (finding)

**Date:** 2026-05-22
**Source:** N=6 most recent runs from `.arandano/bench.csv` and one full `result` event from `.arandano/runs/<latest>/cli-events.jsonl`.

**Aggregate (median across N=6):**

| Metric                    | Value |
| ------------------------- | ----- |
| cli_input_tokens          | TBD   |
| cli_output_tokens         | TBD   |
| cli_cache_read_tokens     | TBD   |
| cli_cache_creation_tokens | TBD   |
| cache_hit_ratio           | TBD   |

**Outcome:** TBD — Outcome 1 (already cached) / Outcome 2 (created not reused) / Outcome 3 (no cache).

**Recommendation:**

- If Outcome 1: no action. Caching is contributing to current measured cli_ms.
- If Outcome 2: open an issue at https://github.com/anthropics/claude-code with the observed pattern; document in Phase 5 as a candidate for direct-API integration.
- If Outcome 3: out of scope for this spec. Phase 5+ candidate — direct Anthropic API with explicit `cache_control` breakpoints could save TBD seconds (estimate from input_tokens × cached fraction × cost-per-1K-token-delta).
```

### Step 6 — Tick T7 checkbox and commit

- [ ] **Step 6: Tick T7 checkbox in plan.md**

- [ ] **Step 7: Commit**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): T7 prompt caching audit finding"
```

---

**Done when:** Finding subsection added to plan.md with real numbers (no TBDs), outcome classified, T7 checkbox ticked.
