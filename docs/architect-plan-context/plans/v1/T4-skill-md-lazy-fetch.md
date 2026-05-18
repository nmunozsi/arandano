> **Location:** `docs/architect-plan-context/plans/v1/T4-skill-md-lazy-fetch.md`

# T4 — SKILL.md: add lazy-fetch strategy sections, remove ARANDANO_PLAN_MERGE_RANGE reference

**Repo:** `arandano-worker`

**Files:**

- Modify: `lib/src/skills/architect/SKILL.md`

**Context:** The spec removes `ARANDANO_PLAN_MERGE_RANGE` (Component 6) and replaces it with per-task context delivered via `ARANDANO_PLAN_CONTEXT_JSON`. The SKILL.md still mentions the old env var in the "Inputs" section. It also needs three new sections explaining the lazy-fetch strategy so the architect knows when and how to inspect code diffs.

No new tests are needed — this is a docs-only change inside the worker image. The build in T5 will verify the file ships correctly.

---

- [ ] **Step 1: Edit `lib/src/skills/architect/SKILL.md`**

The full new content of `SKILL.md` (replace the entire file):

````markdown
---
name: architect
description: Use when assigned the architect role. Updates docs/architecture.md to reflect the just-merged plan's changes. Minimal-diff edits only.
---

# Architect skill

You are running as the `architect` role. Your one job is to refresh `docs/architecture.md` so it reflects what the just-finished plan actually shipped.

## Inputs available to you

- `docs/architecture.md` — the current file.
- Plan files (path provided by the orchestrator): `<spec>/plans/<plan-slug>/{spec.md, plan.md, phase-*/phase.md, T*.md}`.
- Per-task coder context: branch names and PR URLs are already in your prompt (supplied by the driver from `ARANDANO_PLAN_CONTEXT_JSON`).

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

```bash
gh pr diff <prUrl>                                     # preferred — includes PR description
git fetch origin <branch> --depth=1
git diff <defaultBranch>...<branch> -- '*.ts' '*.go' '*.py' 'package.json' 'go.mod'
```
````

Prefer `gh pr diff` when a PR URL is available — it includes the PR description, which gives intent context alongside the code diff. Fall back to `git fetch + git diff` when no PR URL is present or `gh` fails (e.g., token scope).

If `gh pr diff` fails, try `git fetch origin <branch> --depth=1 && git diff <defaultBranch>...<branch>`. If that also fails (branch deleted), log a warning and continue without that task's diff.

## The template (the doc has exactly these six sections)

| §   | Section        | What it owns                                   |
| --- | -------------- | ---------------------------------------------- |
| 1   | Overview       | One paragraph.                                 |
| 2   | Components     | Table: component, path, responsibility, stack. |
| 3   | Data flow      | One mermaid diagram.                           |
| 4   | Tech stack     | Bullets.                                       |
| 5   | Key decisions  | Append-only, dated, newest first.              |
| 6   | Open questions | Same format as §5. Removed when resolved.      |

## Rules

- **DO** append one entry to §5 dated today, summarizing the plan's net architectural change in 1–3 sentences. Use this format exactly:

  ```
  - **YYYY-MM-DD — D<n>: <short title>.** _Why:_ <reason>. _Trade-off:_ <trade>. _Owner:_ @<handle>.
  ```

  `<n>` is one greater than the highest existing `Dn` in §5. If the file has no entries yet, start at `D1`.

- **DO** edit §2 rows when a component's responsibility or path changed.

- **DO** add a new §2 row when the plan introduced a new package, executable, or first-class subsystem.

- **DO** edit the §3 diagram **only** when §2 changed (new component, removed component, or changed responsibility). The diagram lists nodes equal to §2 rows.

- **DO** edit §4 when the plan introduced a new language, runtime, build tool, test framework, CI system, or external service.

- **DO NOT** rewrite or reorder existing §5 entries.

- **DO NOT** delete a §2 row without also adding a §5 entry explaining the removal.

- **DO NOT** touch §3 when §2 didn't change.

- **DO NOT** touch §1 unless the project's purpose changed — typically you won't.

- **DO NOT** add a §6 entry unless the plan exposed a real open question.

## Worked examples

### Example A — plan added a new package

Plan: introduced `@arandano/executors-k8s` and a new `K8sExecutor` class.

Edit:

- §2: add `| K8s executor | packages/executors-k8s | Dispatch tasks to Kubernetes | TypeScript |`.
- §3: add `k8s[K8s executor]` node + `cli --> k8s`.
- §5: append `- **2026-05-20 — D7: Add K8s executor.** _Why:_ homelab readiness. _Trade-off:_ second executor to maintain. _Owner:_ @nmunozsi.`

### Example B — plan refactored internals only

Plan: extracted DAG validation into a separate file; no public API change.

Edit:

- §5: append `- **2026-05-21 — D8: Extract DAG validator.** _Why:_ readability. _Trade-off:_ none. _Owner:_ @nmunozsi.`
- §2/§3/§4/§6 untouched.

## When the diff is empty

After reading all plan files and any fetched diffs, if no section of `docs/architecture.md` would mislead a new engineer about how the system works, **do not commit**. Print `architect: no-op` to stdout. The worker's `architect-driver` recognises this and skips PR creation.

## Commits

Every commit you make follows the gitmoji format from the `gitmoji-commits` skill. The only commits the architect should produce are:

- `:memo: docs(arch): refresh after <plan-slug>` — the single edit commit.

```

- [ ] **Step 2: Verify the file renders correctly**

```

cat lib/src/skills/architect/SKILL.md

```

Confirm the output:
- Does NOT contain `ARANDANO_PLAN_MERGE_RANGE`
- Does NOT contain `git log <base>..<head>`
- DOES contain `## Reading plan context`
- DOES contain `## Deciding what to fetch`
- DOES contain `## Fetching and diffing`
- DOES contain `gh pr diff <prUrl>`
- DOES contain `ARANDANO_PLAN_CONTEXT_JSON`

- [ ] **Step 3: Commit**

```

git add lib/src/skills/architect/SKILL.md
git commit -m ":memo: docs(worker): add lazy-fetch strategy to architect SKILL.md, remove ARANDANO_PLAN_MERGE_RANGE"

```

```
