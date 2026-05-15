# Docs & Tool Restructure — Spec → Plans → Phases → Tasks

> **Location:** `docs/docs-restructure/spec.md`
>
> **Folder structure:**
>
> ```
> docs/docs-restructure/
> ├── spec.md          ← you are here
> └── plans/
>     └── <plan-slug>/  (implementation plan, written next)
> ```

**Status**: approved, ready for implementation planning
**Author**: nmunozsi (with Claude)
**Date**: 2026-05-14

## Goal

Replace the flat `docs/plans/` (10 single-file phase plans) and `.arandano/tasks/<plan-slug>/` (per-task files in one flat dir) with a unified hierarchy that scales from "1 spec / 1 plan / 1 phase / N tasks" to "1 spec / N plans / N phases / N tasks." The same shape applies to the monorepo's `docs/` and to every user project scaffolded by `arandano init`.

The motivation: **(a)** make space and structure for cross-task updates during execution (one MD per task means edits don't conflict), **(b)** keep progress tracking close to the content it tracks (per-phase, per-plan, per-spec), **(c)** give agents that open one file immediate navigational context via a "Location" header at the top of every MD.

## Canonical hierarchy

**Spec → Plans → Phases → Tasks.** Cardinalities:

- 1 spec : N plans (N ≥ 1)
- 1 plan : N phases (N ≥ 1)
- 1 phase : N tasks (N ≥ 1)

One file per level, with a distinct name so the level is unambiguous from the filename alone:

| Level | File             | Owns                                 |
| ----- | ---------------- | ------------------------------------ |
| Spec  | `spec.md`        | Design / vision / non-goals / risks  |
| Plan  | `plan.md`        | Plan overview + phase checklist      |
| Phase | `phase.md`       | Phase overview + task checklist      |
| Task  | `T<N>-<slug>.md` | Task body with step-level checkboxes |

**Single-phase collapse:** when a plan has exactly one phase, the directory for that phase is skipped — tasks live directly under the plan folder, and the plan's `plan.md` owns the task checklist instead of a separate `phase.md`. This avoids a redundant single-folder when the work doesn't need chunking.

```
# Single-phase plan (folder collapsed)
<spec>/plans/<plan>/
├── plan.md          (owns the task checklist)
└── T*.md

# Multi-phase plan
<spec>/plans/<plan>/
├── plan.md          (owns the phase checklist)
├── phase-1-<slug>/
│   ├── phase.md     (owns the task checklist)
│   └── T*.md
└── phase-2-<slug>/
    ├── phase.md
    └── T*.md
```

## Concrete monorepo result

```
docs/
├── architecture.md                       (root, quick-reference summary)
├── initial-build/                        (master spec for building arandano)
│   ├── spec.md                           (was arandano-design.md, moved + Location header added)
│   └── plans/
│       └── v1-rollout/                   (ONE plan, 10 phases — the existing P0-P9)
│           ├── plan.md                   (lists phases with [x] progress)
│           ├── phase-0-foundations/
│           │   ├── phase.md              (lists tasks with [x] progress)
│           │   ├── T0-monorepo-setup.md
│           │   ├── T1-types.md
│           │   └── ...
│           ├── phase-1-node-ts-mvp/
│           ├── phase-2-dag-reviewer-python-go/
│           ├── phase-4-multi-provider-coverage-security/  (was phase-3-…)
│           ├── phase-5-remote-docker-ci-templates/        (was phase-4-…)
│           ├── phase-6-k8s-executor/                      (was 5)
│           ├── phase-7-daemon-http-sqlite/                (was 6)
│           ├── phase-8-auto-planner-skill/                (was 7)
│           └── phase-9-mcp-catalog-examples-polish/       (was 8)
├── perf-instrumentation/                 (peer spec — has its own design)
│   ├── spec.md                           (was 2026-05-14-phase-3-performance-design.md)
│   └── plans/
│       └── instrumentation/              (single-phase plan — folder collapsed)
│           ├── plan.md
│           ├── T1-perf-recorder.md
│           ├── T2-worker-instrument.md
│           └── ...
└── docs-restructure/                     (THIS spec)
    ├── spec.md                           (you are reading it)
    └── plans/
        └── <plan-slug>/                  (written next via writing-plans skill)
```

The `arandano-design.md` at repo root is deleted; a one-line redirect stub remains for one commit cycle and is removed in a follow-up.

## Concrete user-project result

```
.arandano/
├── config.yaml
├── roles/
├── specs/                                (wrapper to avoid name conflicts with roles/, runs/)
│   └── <spec-name>/
│       ├── spec.md
│       └── plans/
│           └── <plan-slug>/              (single- or multi-phase, same rule)
│               ├── plan.md
│               ├── (phase-N-<slug>/)
│               └── T*-slug.md
└── runs/
```

## "Location" header convention

Every `spec.md`, `plan.md`, `phase.md`, and `T*.md` starts with a Location header block — a quoted callout showing the file's full path plus a tree of its immediate parent folder, with `← you are here` next to the current file.

Template:

````markdown
> **Location:** `<full path from repo root>`
>
> **Folder structure:**
>
> ```
> <parent folder>/
> ├── <sibling file>
> ├── <current file>   ← you are here
> └── <sibling folder>/
> ```
````

The header is generated by the migration script for existing files and is a snippet documented in `CLAUDE.md` for new files going forward.

## Progress-tracking convention

`plan.md` owns the phase-level checklist (or task checklist for single-phase plans):

```markdown
## Phases

- [x] [phase-0 — foundations](phase-0-foundations/phase.md)
- [ ] [phase-1 — node-ts-mvp](phase-1-node-ts-mvp/phase.md)
```

`phase.md` owns the task-level checklist:

```markdown
## Tasks

- [x] [T0 — monorepo setup](T0-monorepo-setup.md)
- [ ] [T1 — types](T1-types.md)
```

Each `T<N>-*.md` owns its own step-level `- [ ]` checkboxes (current convention preserved).

## Cross-task updates

The structure explicitly supports tasks updating each other and the plan during execution:

- Each task is a separate file → no merge conflicts between agents updating different tasks.
- The agent executing a task has read+write access to all files in the spec/plan/phase folder via its workspace bind-mount.
- An agent can:
  - Mark its own task complete in `phase.md` (or `plan.md` for single-phase plans).
  - Edit a later task file (e.g., `T5-…md`) when a discovery during the current task changes the future plan.
  - Add a `- [ ]` entry to `phase.md` + create a new `T<N+1>-…md` if a new task surfaces mid-execution.
  - Add cross-phase notes to `plan.md`.
- All such edits land as commits inside the agent's branch and surface in the PR review.

## CLI & worker surface changes

**`arandano run` flags** (in `packages/cli/src/commands/run.ts`):

- `--plan=<slug>` keeps its short form; the lookup walks `.arandano/specs/**/plans/<slug>/` and errors out clearly if the slug is ambiguous across specs.
- New `--spec=<spec>` flag disambiguates when needed. Equivalent: `arandano run --spec=auth --plan=rewrite`.
- New `--phase=<phase-slug>` runs a single phase within a multi-phase plan. Equivalent of `<spec>/<plan>/<phase>` path.

**Plan loader** (`packages/core/src/tasks/loadPlan.ts`):

- Resolves a plan directory from any of `--plan`, `--spec`, `--phase`.
- Within the resolved directory, walks one extra level if `phase-*` subdirectories are present; otherwise reads tasks directly.
- Returns the same flat `TaskMd[]` shape — the Orchestrator and DAG logic are unchanged.

**Worker** (`arandano-worker/lib/src/driver.ts`):

- The worker reads a single task by `ARANDANO_TASK_MD` (the host sets the full path).
- No change required beyond confirming the longer path is forwarded correctly through `containerSpec.ts` (which just stringifies it).

**Templates** (`packages/templates/stacks/<stack>/.arandano/`):

- Scaffold's example plan moves from `.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md` to `.arandano/specs/greet/plans/initial/T1-add-greet.md`.
- New scaffold files: `.arandano/specs/greet/spec.md` (minimal example) and `.arandano/specs/greet/plans/initial/plan.md` (single-phase plan overview).
- The `config.yaml` template no longer mentions the legacy `tasks/` path.

**Backward compatibility**: dropped. There is one live user project (`arandano-examples/node-ts-toy`) and we migrate it in the same PR. No deprecation period.

## Migration approach

A script under `packages/cli/src/migration/restructure-docs.ts` (exposed as `arandano migrate docs`) does the bulk of the work and is reusable on user projects.

1. **Scan** source directories: `docs/plans/*.md` (monorepo phase plans) and `.arandano/tasks/<slug>/T*.md` (user projects).
2. **Parse** each monorepo phase plan and extract every `### Task N: <title>` section into a separate `T<N>-<kebab-of-title>.md` file. The original Goal/Architecture/Tech-Stack/File-Structure preamble becomes the `phase.md` for that phase. Progress (`- [x]`) state is preserved from the source.
3. **Move** `arandano-design.md` to `docs/initial-build/spec.md`. Add Location header. Replace the old file with a one-line redirect stub.
4. **Move** `docs/superpowers/specs/2026-05-14-phase-3-performance-design.md` to `docs/perf-instrumentation/spec.md`. Add Location header.
5. **Move + split** `docs/plans/2026-05-14-phase-3-performance.md` into `docs/perf-instrumentation/plans/instrumentation/plan.md` + `T*.md` files. Drop the original Task 0 (renumbering existing phase plans) since the migration handles renumbering implicitly. The remaining tasks keep their existing numbers (T1 stays T1, T10 stays T10) — no down-renumber.
6. **Migrate `arandano-examples/node-ts-toy/.arandano/tasks/`** by moving each `<plan-slug>/T*.md` to `.arandano/specs/<spec>/plans/<plan-slug>/T*.md`. The script prompts for the spec name (or accepts `--spec=<name>`); the first user project uses `helpers` as the spec name.
7. **Update `CLAUDE.md`** with a new "Docs and tool folder structure" section documenting the hierarchy, file-level conventions, single-phase collapse rule, Location-header template, and progress-tracking convention. Update any in-file path references to old `docs/plans/...` or `.arandano/tasks/...` paths.
8. **Add Location header** to every `.md` produced or moved by the script.
9. **Verify**: a `--dry-run` mode prints the mapping (source → destination, header to be added); the real run requires `--commit`. A round-trip check confirms every `### Task N` heading in the source produced exactly one `T*.md` file in the destination.
10. **Commit** as one `chore(docs): restructure to spec→plans→phases→tasks hierarchy`.

## Acceptance criteria

- [ ] `arandano-design.md` deleted at repo root; content lives at `docs/initial-build/spec.md` with Location header
- [ ] All 10 existing phase plans split into per-task files under `docs/initial-build/plans/v1-rollout/phase-N-<slug>/` with generated `phase.md` per phase and a top-level `plan.md`
- [ ] `docs/perf-instrumentation/spec.md` and `docs/perf-instrumentation/plans/instrumentation/{plan.md, T*.md}` exist; Task 0 (renumber) dropped from the perf plan
- [ ] Every `spec.md`, `plan.md`, `phase.md`, and `T*.md` has a Location header at the top
- [ ] `CLAUDE.md` includes a "Docs and tool folder structure" section documenting hierarchy, naming, single-phase collapse, Location header, and progress-tracking conventions
- [ ] `packages/templates/stacks/<stack>/.arandano/` template uses `specs/<spec>/plans/<plan>/{plan.md, T*.md}` (no `tasks/<plan>/T*.md`)
- [ ] `packages/core/src/tasks/loadPlan.ts` handles single- and multi-phase plans; tests cover both shapes
- [ ] `arandano run --plan=<slug>` resolves an unambiguous slug; `--spec` and `--phase` flags accepted; ambiguous slug yields a clear error
- [ ] `arandano migrate docs` command exists, idempotent, with `--dry-run` and `--commit` modes
- [ ] `arandano-examples/node-ts-toy/.arandano/tasks/` migrated to `.arandano/specs/helpers/plans/<plan-slug>/T*.md`
- [ ] All existing tests pass
- [ ] A single-task e2e run against the migrated node-ts-toy confirms the worker reads the new path
- [ ] The Phase 3 perf plan (already written) can be executed afterwards with no edits beyond path updates handled by the migration

## Out of scope (explicitly deferred)

- Splitting any of the 10 migrated phase plans into multi-phase plans. They migrate as phases of one plan (`v1-rollout`); their internal chunking is preserved as-is.
- A `arandano lint docs` command that enforces the Location-header convention at commit time. Manual review for now.
- Auto-generating per-phase `spec.md` files. The master `spec.md` carries the full vision; per-phase specs are added only when a phase genuinely needs its own design discussion.
- Renaming or restructuring `docs/superpowers/skills/` or any superpowers-managed paths.
- Editing the renumbered phase plans' internal content beyond what the migration script does mechanically. Re-targeting Phase N references inside other phases is left to a follow-up cleanup.

## Risks & mitigations

- **Migration script silently drops content from a phase plan.** Mitigation: `--dry-run` prints the planned mapping; the real run requires `--commit`. A round-trip check verifies every `### Task N` heading in the source produced exactly one destination `T*.md`. Run on a copy first if unsure.
- **Worker can't find tasks at the new path.** Mitigation: a single-task e2e on the migrated node-ts-toy after the migration, before declaring done.
- **External bookmarks to `arandano-design.md` go stale.** Mitigation: a one-line redirect stub remains at the old path for one commit cycle, then is removed.
- **In-flight Phase 3 perf work has paths that will be wrong post-migration.** Mitigation: do the migration BEFORE starting Phase 3 perf execution. The perf plan's Task 0 (renumber) becomes a no-op handled by the migration script itself and is dropped.
- **Ambiguous `--plan=<slug>` resolution across specs.** Mitigation: the loader produces a clear error listing the matching paths and asking the user to disambiguate with `--spec`.
