> **Location:** `docs/architect-plan-context/plans/v1/T4-skill-md-lazy-fetch.md`

# T4 — SKILL.md: add lazy-fetch strategy sections, remove ARANDANO_PLAN_MERGE_RANGE reference

**Repo:** `arandano-worker`

**Files:**

- Modify: `lib/src/skills/architect/SKILL.md`

**Context:** The spec removes `ARANDANO_PLAN_MERGE_RANGE` (Component 6) and replaces it with per-task context delivered via `ARANDANO_PLAN_CONTEXT_JSON`. The SKILL.md still mentions the old env var in the "Inputs" section. It also needs three new sections explaining the lazy-fetch strategy so the architect knows when and how to inspect code diffs.

No new tests are needed — this is a docs-only change inside the worker image. The build in T5 will verify the file ships correctly.

---

- [ ] **Step 1: Remove the merge-range input line from `lib/src/skills/architect/SKILL.md`**

In the `## Inputs available to you` section, remove this line:

```
- Git history of the plan's merge range: `git log <base>..<head>` (the range is in env var `ARANDANO_PLAN_MERGE_RANGE`).
```

Replace it with:

```
- Per-task coder context: branch names and PR URLs are already in your prompt (supplied by the driver from `ARANDANO_PLAN_CONTEXT_JSON`).
```

- [ ] **Step 2: Insert three new sections before `## The template`**

After the updated `## Inputs available to you` section and before the `## The template` section, insert:

```
## Reading plan context

The driver resolves `ARANDANO_PLAN_CONTEXT_JSON` (inline) or `ARANDANO_PLAN_CONTEXT_PATH` (file) and injects the result directly into your prompt — you never need to read the env var or file yourself. The branch/PR list is already there. Do not fetch all branches upfront; scan `docs/architecture.md` and the plan files first to understand current state and intent.

## Deciding what to fetch

Fetch a task's diff when the plan file or task title signals:

- A new package, library, or external dependency is added
- A new top-level directory or module is introduced
- An inter-service or inter-package interface is created or changed
- The data model, API surface, or deployment topology changes

Skip the fetch when the task is purely internal: bug fixes, test additions, documentation changes, renames, or changes isolated within an existing component.

## Fetching and diffing

Prefer `gh pr diff <prUrl>` when a PR URL is available — it includes the PR description alongside the code diff. Fall back to `git fetch + git diff` when no PR URL is present or `gh` fails.

Run these commands in the container:

  gh pr diff <prUrl>
  git fetch origin <branch> --depth=1
  git diff <defaultBranch>...<branch> -- '*.ts' '*.go' '*.py' 'package.json' 'go.mod'

If `gh pr diff` fails, try the git fetch + diff fallback. If that also fails (branch deleted), log a warning and continue without that task's diff.
```

- [ ] **Step 3: Update `## When the diff is empty`**

Replace the current paragraph:

```
If after applying the rules above your changes would not modify the file, **do not commit**. Print `architect: no-op` to stdout. The worker's `architect-driver` recognises this and skips PR creation.
```

With:

```
After reading all plan files and any fetched diffs, if no section of `docs/architecture.md` would mislead a new engineer about how the system works, **do not commit**. Print `architect: no-op` to stdout. The worker's `architect-driver` recognises this and skips PR creation.
```

- [ ] **Step 4: Verify**

```
grep -n "ARANDANO_PLAN_MERGE_RANGE" lib/src/skills/architect/SKILL.md
```

Expected: no output (the old env var is gone).

```
grep -n "Reading plan context\|Deciding what to fetch\|Fetching and diffing\|ARANDANO_PLAN_CONTEXT_JSON" lib/src/skills/architect/SKILL.md
```

Expected: four matching lines.

- [ ] **Step 5: Commit**

```
git add lib/src/skills/architect/SKILL.md
git commit -m ":memo: docs(worker): add lazy-fetch strategy to architect SKILL.md, remove ARANDANO_PLAN_MERGE_RANGE"
```
