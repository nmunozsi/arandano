> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T0-prerequisites.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md                              ← you are here
> ├── T1-instrumentation-foundation.md
> ├── T2-parallelize-gates.md
> ├── T3-context-injection-and-tool-trim.md
> ├── T4-inline-role-and-standards.md
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 0: Prerequisites — secrets + CLAUDE.md rule

**Goal:** Set `ANTHROPIC_API_KEY` and `GH_TOKEN` as persistent env vars and add a Secrets section to `CLAUDE.md` so Claude can run measurement commands autonomously from T2 onwards without ever handling secret values.

**Why user does this manually:** `setx` sets a system-level env var; Claude shouldn't touch system state without explicit consent. The CLAUDE.md edit is also a one-time policy commit.

**Files:**

- Modify: `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\CLAUDE.md` (append `## Secrets` section)
- System: Windows user env vars (`ANTHROPIC_API_KEY`, `GH_TOKEN`)

---

- [ ] **Step 1: User runs `setx` in PowerShell**

```powershell
setx ANTHROPIC_API_KEY "<paste-your-key-here>"
setx GH_TOKEN "<paste-your-token-here>"
```

Both commands print `SUCCESS: Specified value was saved.` `setx` does **not** affect the current shell; a new one is required.

- [ ] **Step 2: User opens a fresh PowerShell window**

- [ ] **Step 3: User verifies existence without echoing values**

Run:

```powershell
"ANTHROPIC_API_KEY", "GH_TOKEN" | ForEach-Object {
  if (Test-Path "env:$_") { "{0}: set" -f $_ } else { "{0}: MISSING" -f $_ }
}
```

Expected output:

```
ANTHROPIC_API_KEY: set
GH_TOKEN: set
```

If either reads `MISSING`, re-run Step 1 and re-open PowerShell.

- [ ] **Step 4: Append `## Secrets` section to `CLAUDE.md`**

Open `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\CLAUDE.md` and append at the end (after the existing architect section):

```markdown
---

## Secrets

- NEVER print, log, copy, `echo`, or otherwise output the values of these env vars:
  `ANTHROPIC_API_KEY`, `GH_TOKEN`.
- NEVER read files matching: `secrets.env`, `.env` (except `.env.example`), `id_rsa`, `*.pem`.
- When invoking `arandano run`, rely on inherited env vars — do not interpolate the values
  into command lines, log lines, or error messages.
- If a tool output would contain one of these env values, redact it before continuing.

After T0 of the perf-optimization plan, every measurement step is executable by Claude directly
via `node ...packages/cli/dist/bin.js run --plan ...` — no secret handling required from Claude.
```

- [ ] **Step 5: Commit the CLAUDE.md change**

```bash
git add CLAUDE.md
git commit -m ":memo: docs(claude): add secrets section enabling autonomous measurement runs"
```

- [ ] **Step 6: Verify Claude can launch a worker without handling secrets**

Run a single existing measurement task from this directory:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" doctor
```

`doctor` should print `OK` lines for env-var presence checks. (If `doctor` doesn't validate env vars yet, this is informational — proceed if the command exits 0.)

- [ ] **Step 7: Tick the T0 checkbox in `plan.md`**

Edit `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md` and change `- [ ] [T0 — ...]` to `- [x] [T0 — ...]`. Commit:

```bash
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): tick T0 prerequisites in perf-optimization plan"
```

---

**Done when:** Both env vars set, CLAUDE.md updated, `plan.md` checkbox ticked.
