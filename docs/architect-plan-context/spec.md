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
- Removing `ARANDANO_PLAN_MERGE_RANGE` (kept for backward compatibility, cleaned up separately).

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

### 3. `ARANDANO_PLAN_CONTEXT_PATH` — new env var for T-architect

**File:** `packages/core/src/orchestrator/orchestrator.ts`

Added to the `envOverride` for T-architect alongside the existing `ARANDANO_PLAN_SLUG` and `ARANDANO_PLAN_MERGE_RANGE`. Contains a **workdir-relative path** (e.g. `.arandano/runs/smoke-context.json`), consistent with how `ARANDANO_TASK_MD` and `ARANDANO_RUN_FOLDER` are set. The architect driver resolves it against `process.cwd()` (the bind-mounted workspace root inside the container).

### 4. Architect driver — reads context, builds richer prompt

**File:** `arandano-worker/lib/src/architect/architectDriver.ts`

At startup, the driver reads `ARANDANO_PLAN_CONTEXT_PATH` and parses `plan-context.json`. The prompt replaces the current `git log ${mergeRange}` instruction with structured per-task guidance:

```
Coder tasks in this plan:
  - AS1: branch=agent/AS1-1716998272641 pr=https://github.com/.../pull/12
  - AS2: branch=agent/AS2-1716998391003

For each task you may run:
  gh pr diff <prUrl>                                   (preferred)
  git fetch origin <branch> --depth=1 && git diff <defaultBranch>...<branch>   (fallback)

Only fetch what you need. Read SKILL.md for guidance on what warrants a fetch.
```

**Fallback:** When `ARANDANO_PLAN_CONTEXT_PATH` is absent or the file is unreadable, the driver falls back to the current prompt (no crash, no hard failure). This preserves backward compatibility with older orchestrator versions.

### 5. SKILL.md — lazy-fetch strategy

**File:** `arandano-worker/lib/src/skills/architect/SKILL.md`

Three new sections added after the existing instructions:

**Reading plan context**
Read `ARANDANO_PLAN_CONTEXT_PATH` at startup. It lists coder tasks, their agent branches, and PR URLs. Do not fetch all branches upfront — scan `docs/architecture.md` and the plan files first to understand current state and intent.

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
dispatches T-architect with ARANDANO_PLAN_CONTEXT_PATH
        │
        ▼
architect container
  └── reads plan-context.json
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
- `orchestrator` — `ARANDANO_PLAN_CONTEXT_PATH` present in T-architect's `envSet`
- `orchestrator` — failed coder tasks excluded from context file
- `orchestrator` — reviewer tasks excluded from context file
- `orchestrator` — tasks with no `branch` in state excluded from context file

**`arandano-worker/lib` (vitest):**

- `architectDriver` — valid `ARANDANO_PLAN_CONTEXT_PATH` fixture produces prompt with branch and PR URL lines
- `architectDriver` — absent `ARANDANO_PLAN_CONTEXT_PATH` produces fallback prompt without crashing
- `architectDriver` — unreadable context file produces fallback prompt without crashing

## Open questions

- **`ARANDANO_PLAN_CONTEXT_PATH` inside the container:** The path is the host absolute path, which is bind-mounted at the same location. This works for Docker (same path in/out). For a future k8s executor the path handling may need revisiting — the context file would need to be mounted or injected differently.
- **`ARANDANO_PLAN_MERGE_RANGE` cleanup:** Now that `plan-context.json` supersedes it, `ARANDANO_PLAN_MERGE_RANGE` should be removed in a follow-up once SKILL.md no longer references it. Not in scope here.
