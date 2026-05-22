> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T3-context-injection-and-tool-trim.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md
> ├── T1-instrumentation-foundation.md
> ├── T2-parallelize-gates.md
> ├── T3-context-injection-and-tool-trim.md            ← you are here
> ├── T4-inline-role-and-standards.md
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 3: Exercise context injection + trim Claude tool surface

**Goal:** Two improvements in one task:

- **T3a (context injection)**: Add `inject_context:` frontmatter to T4/T5/T6 in node-ts-toy so `buildContextBlock` actually pre-injects `src/greet.ts` into the prompt. The infrastructure exists; only the task frontmatter needs it.
- **T3b (tool trim)**: Pass `--disallowed-tools` to the claude CLI to drop unused tools that bloat the system prompt and slow tool selection. Verify the flag exists in the deployed Claude Code; if not, drop T3b and document the deferral.

**Files:**

- Modify: `arandano-examples/node-ts-toy/.arandano/specs/helpers/plans/2026-05-11-three-helpers/T4-add-uppercase.md`
- Modify: `.../T5-add-lowercase.md`
- Modify: `.../T6-add-titlecase.md`
- Modify: `arandano-worker/lib/src/driver.ts` — append `--disallowed-tools` arg
- Test: no new automated tests (smoke via measurement run)

---

### Step 1 — Probe the Claude Code CLI for `--disallowed-tools` support

- [ ] **Step 1: Run from anywhere on the host**

```powershell
claude --help 2>&1 | Select-String -Pattern "disallowed-tools|disable-tools|allowed-tools|tools"
```

If the output contains `--disallowed-tools`, proceed to Step 2.
If it contains `--allowed-tools` (allowlist instead of denylist), adapt Step 6 to use that with the inverse set.
If neither is present, **skip Steps 5–6 entirely** and note in T8 summary that T3b was deferred.

### Step 2 — Add `inject_context:` to T4 task frontmatter

- [ ] **Step 2: Read the current frontmatter**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" --version
```

Open `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy\.arandano\specs\helpers\plans\2026-05-11-three-helpers\T4-add-uppercase.md`. The frontmatter is YAML between `---` lines at the top.

- [ ] **Step 3: Add the `inject_context` key**

Add this line to the frontmatter:

```yaml
inject_context:
  - src/greet.ts
```

(Keep all existing frontmatter fields intact.)

### Step 4 — Repeat for T5 and T6

- [ ] **Step 4: T5 frontmatter** — same `inject_context: [src/greet.ts]`.

- [ ] **Step 5: T6 frontmatter (titlecase)** — same `inject_context: [src/greet.ts]`. (Titlecase still benefits from seeing the existing structure even though it builds on the other two.)

### Step 6 — Add `--disallowed-tools` arg in `driver.ts` (only if Step 1 confirmed support)

- [ ] **Step 6: Update the `invokeCli` args in `arandano-worker/lib/src/driver.ts`**

Find:

```ts
args: ['--print', '--verbose', '--dangerously-skip-permissions', '--model', model, '--output-format', 'stream-json'],
```

Replace with:

```ts
const disallowed = [
  'AskUserQuestion',
  'CronCreate',
  'CronDelete',
  'CronList',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
  'Monitor',
  'NotebookEdit',
  'PushNotification',
  'ScheduleWakeup',
  'ToolSearch',
  'WebFetch',
  'WebSearch',
].join(',');

args: [
  '--print',
  '--verbose',
  '--dangerously-skip-permissions',
  '--model', model,
  '--output-format', 'stream-json',
  '--disallowed-tools', disallowed,
],
```

Apply the same change to the fallback `invokeCli` call (the one without `--output-format`).

### Step 7 — Build and test

- [ ] **Step 7: Worker tests**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
npm test
```

### Step 8 — Commit and push worker

- [ ] **Step 8: Commit + push**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src
git commit -m ":zap: perf(driver): drop unused tools via --disallowed-tools"
git push origin main
```

(If T3b was skipped, also skip this commit and proceed straight to Step 10.)

- [ ] **Step 9: Wait for image build**

```powershell
gh run watch $(gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1 --json databaseId --jq '.[0].databaseId') --repo nmunozsi/arandano-worker
```

### Step 10 — Commit task frontmatter changes

- [ ] **Step 10: Commit node-ts-toy changes**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
git add .arandano/specs/helpers/plans/2026-05-11-three-helpers
git commit -m ":zap: perf(tasks): inject src/greet.ts as context for T4/T5/T6"
git push origin main
```

### Step 11 — Run measurement

- [ ] **Step 11: Reset state and run plan**

Reset `.arandano/state.json` in node-ts-toy (keep AS1/AS2). Then:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

- [ ] **Step 12: Verify injection happened**

Read the latest journal: `.arandano/runs/<latest>/journal.md` and confirm a log line like `injected context: src/greet.ts (Xb)` (or absent the explicit log, that the bench shows lower `cli_tool_calls` than T2).

- [ ] **Step 13: Capture bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

Expect: `cli_tool_calls` per task drops by ≥ 2 (fewer file-discovery reads); `worker_cli_ms` decreases relative to T2.

### Step 14 — Record results and commit

- [ ] **Step 14: Append "+ T3 F + tool trim" row** in plan.md Results table with median of T4+T5.

- [ ] **Step 15: Tick T3 checkbox in plan.md**

- [ ] **Step 16: Commit results**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): T3 F + tool-trim results row"
```

---

**Done when:** All three task files have `inject_context`, `--disallowed-tools` is wired (or formally deferred), `cli_tool_calls` drops vs T2, Results row recorded.
