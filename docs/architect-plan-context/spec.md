> **Location:** `docs/architect-plan-context/spec.md`
>
> **Folder structure:**
>
> ```
> docs/architect-plan-context/
> ├── spec.md          ← you are here
> └── plans/
>     └── <plan-slug>/  (implementation plan, written next)
> ```

---

title: Architect plan context — per-task branch and PR diff access
status: approved, ready for implementation planning
author: nmunozsi (with Claude)
date: 2026-05-18

---

# Architect plan context

## Overview

The `architect` worker role refreshes `docs/architecture.md` at the end of every full-plan run. Today it receives `ARANDANO_PLAN_MERGE_RANGE` — the result of `git log <defaultBranch>..HEAD` on the host — which is always empty because coder tasks commit to agent branches inside containers, never to the local checkout. The architect therefore has no code-diff context and falls back to reading plan files alone.

For large-scale projects this is insufficient. A plan introducing a new package, an inter-service interface, or a new external dependency will go undetected unless the architect can inspect the actual code changes. This spec closes that gap by:

1. **Closing the `state.json` loop** so `branch` and `pr_url` written by each worker are readable by the orchestrator.
2. **Writing a `plan-context.json`** file before T-architect is dispatched, giving structured per-task context.
3. **Updating the architect driver and SKILL.md** so the architect lazily fetches only the diffs it needs.

## Non-goals

- Merging agent branches locally (keeps the orchestrator git-free).
- Pre-computing diffs in the orchestrator (deferred to the architect to control token cost).
- Changing how coder tasks push branches or open PRs.

## Components

### 1. `runOne` — result.json back-propagation

After `executor.wait()` resolves with `reason: 'ok'`, `runOne` reads the `result.json` written by the worker and merges `branch` and `pr_url` back into `state.json` via the existing `store.update()` callback pattern.

**File:** `packages/core/src/orchestrator/runOne.ts`

**Behaviour:**

- `ExitResult.resultJsonPath` already carries the path; `runOne` just reads it.
- Only `branch` and `pr_url` are extracted — no other result fields leak into state.
- If `result.json` is absent, empty, or malformed the update is silently skipped; the task still records `completed`.
- `TaskState` already declares `branch?: string` and `pr_url?: string`; no schema change needed.

### 2. `plan-context.json` — orchestrator writes before architect dispatch

**File:** `packages/core/src/orchestrator/orchestrator.ts`

**Location on disk:** `.arandano/runs/<planSlug>-context.json`

**Schema:**

```json
{
  "planSlug": "smoke",
  "defaultBranch": "main",
  "tasks": [
    {
      "id": "AS1",
      "branch": "agent/AS1-1716998272641",
      "prUrl": "https://github.com/org/repo/pull/12"
    },
    {
      "id": "AS2",
      "branch": "agent/AS2-1716998391003"
    }
  ]
}
```

**Inclusion rules:**

- Only coder tasks (`role === 'coder'`) that completed successfully and have `branch` set in `state.json`.
- Reviewer tasks, failed tasks, and tasks with no branch are excluded.
- `prUrl` is included when present; omitted otherwise. The architect must tolerate its absence.

**Timing:** Written in the T-architect dispatch block, after all coder and reviewer tasks have settled, before `runOne` is called for T-architect.

### 3. Context delivery — two env vars for two executor backends

**File:** `packages/core/src/orchestrator/orchestrator.ts`

The orchestrator always sets **both** of the following in `envOverride` for T-architect:

| Env var                      | Value                                                                        | Used by                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ARANDANO_PLAN_CONTEXT_PATH` | workdir-relative path, e.g. `.arandano/runs/smoke-context.json`              | Docker executor (bind-mount makes the file accessible at the same path)                |
| `ARANDANO_PLAN_CONTEXT_JSON` | the full `plan-context.json` content serialised as a single-line JSON string | k8s executor (clones fresh from `git_url`; host files are never accessible in the Pod) |

Setting both is intentional and cheap — the JSON is small. The architect driver checks `ARANDANO_PLAN_CONTEXT_JSON` first (parse inline, no I/O), then falls back to reading `ARANDANO_PLAN_CONTEXT_PATH` (file read), then falls back to the legacy prompt. This means the k8s executor needs no special handling and no executor-specific code in the orchestrator.

`ARANDANO_PLAN_SLUG` is retained. `ARANDANO_PLAN_MERGE_RANGE` is removed (see Component 6).

### 4. Architect driver — reads context, builds richer prompt

**File:** `arandano-worker/lib/src/architect/architectDriver.ts`

At startup the driver resolves context using the priority chain:

1. Parse `ARANDANO_PLAN_CONTEXT_JSON` directly (string → JSON, no I/O)
2. Read and parse the file at `ARANDANO_PLAN_CONTEXT_PATH` relative to `process.cwd()`
3. Fall back to a minimal prompt with no task list (no crash)

The `mergeRange` variable and the `git log ${mergeRange}` prompt instruction are removed entirely. The prompt is replaced with structured per-task guidance:

```
Coder tasks in this plan:
  - AS1: branch=agent/AS1-1716998272641 pr=https://github.com/.../pull/12
  - AS2: branch=agent/AS2-1716998391003

For each task you may run:
  gh pr diff <prUrl>                                   (preferred)
  git fetch origin <branch> --depth=1 && git diff <defaultBranch>...<branch>   (fallback)

Only fetch what you need. Read SKILL.md for guidance on what warrants a fetch.
```

**Fallback prompt** (no context available): identical to the current prompt minus the `git log` line — the architect reads plan files only.

### 5. SKILL.md — lazy-fetch strategy

**File:** `arandano-worker/lib/src/skills/architect/SKILL.md`

Three new sections added after the existing instructions:

**Reading plan context**
Context arrives as `ARANDANO_PLAN_CONTEXT_JSON` (inline string) or `ARANDANO_PLAN_CONTEXT_PATH` (file). The driver handles both — you never need to read the file yourself; the branch/PR list is already in your prompt. Do not fetch all branches upfront — scan `docs/architecture.md` and the plan files first to understand current state and intent.

**Deciding what to fetch**
Fetch a task's diff when the plan file or task title signals:

- A new package, library, or external dependency is added
- A new top-level directory or module is introduced
- An inter-service or inter-package interface is created or changed
- The data model, API surface, or deployment topology changes

Skip the fetch when the task is purely internal: bug fixes, test additions, documentation changes, renames, or changes isolated within an existing component.

**Fetching and diffing**

```bash
gh pr diff <prUrl>                                     # preferred — includes PR description
git fetch origin <branch> --depth=1
git diff <defaultBranch>...<branch> -- '*.ts' '*.go' '*.py' 'package.json' 'go.mod'
```

Prefer `gh pr diff` when a PR URL is available — it includes the PR description, which gives intent context alongside the code diff.

**Updated no-op rule:** After reading all plan files and any fetched diffs, if no section of `docs/architecture.md` would mislead a new engineer about how the system works, print `architect: no-op` and exit.

### 6. Remove `ARANDANO_PLAN_MERGE_RANGE`

`plan-context.json` fully supersedes the merge-range approach. Keeping it would leave dead code and a confusing, always-empty env var in every architect container.

**Deletions:**

| Location                                               | What is removed                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/orchestrator/orchestrator.ts`       | `gitMergeRange()` helper (the `execFile`-based git shell-out) and `ARANDANO_PLAN_MERGE_RANGE` from `envOverride` |
| `arandano-worker/lib/src/architect/architectDriver.ts` | `mergeRange` variable and the `git log ${mergeRange}` line in the prompt                                         |
| `arandano-worker/lib/src/skills/architect/SKILL.md`    | Any reference to merge range or `git log <range>`                                                                |

After this removal the orchestrator has zero git shell-outs, which restores the original design invariant: the orchestrator is a pure TypeScript scheduler with no git dependency.

## Data flow

```
coder task container
  └── writes result.json { branch, pr_url, ... }
        │
        ▼
DockerExecutor.wait() → ExitResult { resultJsonPath }
        │
        ▼
runOne reads result.json → store.update(branch, pr_url → state.json)
        │
        ▼
orchestrator collects completed coder tasks with branch from state.json
        │
        ▼
writes .arandano/runs/<planSlug>-context.json
        │
        ▼
dispatches T-architect with:
  ARANDANO_PLAN_SLUG=smoke
  ARANDANO_PLAN_CONTEXT_PATH=.arandano/runs/smoke-context.json   ← Docker
  ARANDANO_PLAN_CONTEXT_JSON={"planSlug":"smoke",...}             ← k8s
        │
        ▼
architect container
  └── driver: parses PLAN_CONTEXT_JSON (or reads PLAN_CONTEXT_PATH)
  └── reads SKILL.md
  └── selectively: gh pr diff / git fetch + git diff
  └── edits docs/architecture.md or prints "architect: no-op"
```

## Error handling

| Scenario                                  | Behaviour                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `result.json` missing or malformed        | `runOne` skips back-propagation; task still completes                               |
| Task completed but branch not pushed      | `branch` absent from `result.json`; task excluded from context file                 |
| No coder tasks have a branch (all failed) | `plan-context.json` written with empty `tasks: []`; architect reads plan files only |
| `ARANDANO_PLAN_CONTEXT_PATH` absent       | Architect driver falls back to current prompt                                       |
| `gh pr diff` fails (token missing)        | Architect falls back to `git fetch + git diff`; SKILL.md documents this             |
| `git fetch` fails (branch deleted)        | Architect logs warning, skips that task's diff, continues                           |

## Testing

**`packages/core` (vitest):**

- `runOne` — after ok exit, `state.json` contains `branch` and `pr_url` from fixture `result.json`
- `runOne` — missing `result.json` does not throw; task status is still `completed`
- `runOne` — malformed `result.json` (invalid JSON) does not throw
- `orchestrator` — `plan-context.json` written before T-architect dispatches; contains only completed coder tasks with branches
- `orchestrator` — `ARANDANO_PLAN_CONTEXT_PATH` present in T-architect's `envSet` as workdir-relative path
- `orchestrator` — `ARANDANO_PLAN_CONTEXT_JSON` present in T-architect's `envSet` with correct serialised JSON
- `orchestrator` — `ARANDANO_PLAN_MERGE_RANGE` is NOT present in T-architect's `envSet`
- `orchestrator` — failed coder tasks excluded from context file
- `orchestrator` — reviewer tasks excluded from context file
- `orchestrator` — tasks with no `branch` in state excluded from context file

**`arandano-worker/lib` (vitest):**

- `architectDriver` — `ARANDANO_PLAN_CONTEXT_JSON` env var produces prompt with branch and PR URL lines
- `architectDriver` — `ARANDANO_PLAN_CONTEXT_PATH` file fallback produces prompt with branch and PR URL lines
- `architectDriver` — `ARANDANO_PLAN_CONTEXT_JSON` takes priority over `ARANDANO_PLAN_CONTEXT_PATH` when both set
- `architectDriver` — absent both env vars produces fallback prompt without crashing
- `architectDriver` — malformed JSON in `ARANDANO_PLAN_CONTEXT_JSON` produces fallback prompt without crashing
- `architectDriver` — prompt does NOT contain `git log` (merge range removed)
