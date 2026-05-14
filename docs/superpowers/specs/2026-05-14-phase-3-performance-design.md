# Phase 3 — Performance Instrumentation & Improvements (Design)

**Status**: approved, ready for implementation planning
**Author**: nmunozsi (with Claude)
**Date**: 2026-05-14
**Supersedes**: nothing
**Renumbers**: existing Phases 3-8 become 4-9 (filenames will be renamed alongside this plan)

## Goal

Containers currently take ~12-15 min per task (T6 took 15:37 in the three-helpers
e2e). We have no per-phase breakdown — the only durations recorded are
`started_at`/`ended_at` in `result.json`. This phase:

1. **Instruments** every phase (host + worker) so the breakdown is visible.
2. **Establishes a baseline** by re-running the three-helpers plan with
   instrumentation in place.
3. **Re-brainstorms** improvements once we see the real data, instead of
   committing blind to theoretical fixes.
4. **Applies the agreed improvements** and re-measures after each, recording
   the delta in a structured CSV.

**Success criterion**: per-task wall time drops ≥40% (target ~8 min from the
~12-15 min baseline) and a 3-task plan completes in <20 min wall. Every
improvement must be backed by a measured delta in `bench.csv`, not vibes.

## Architecture

Three new surfaces:

### 1. `packages/core/src/perf.ts` — `PerfRecorder`

```ts
export interface PhaseRecord {
  phase: string;
  ms: number;
}

export class PerfRecorder {
  start(phase: string): () => void; // returns stop fn
  records(): PhaseRecord[];
  writeTimingsJson(path: string): Promise<void>;
}
```

Used by both `DockerExecutor` (host) and `driver.ts` (worker). No external
dependencies. Worker writes `timings.json` into its run folder at exit; host
reads and merges it with its own timings after the container terminates.

### 2. Per-run `timings.json` + persistent `bench.csv`

**Per-run** — `.arandano/runs/<folder>/timings.json`:

```json
{
  "task_id": "T6",
  "stack": "node-ts",
  "image": "ghcr.io/nmunozsi/arandano-worker:latest@sha256:abc...",
  "host": { "pull": 8421, "clone": 3104, "create": 412, "wait": 893102, "copy_artifacts": 89 },
  "worker": {
    "checkout": 412,
    "install": 178233,
    "cli": 412988,
    "gate.format": 8421,
    "gate.lint": 12993,
    "gate.typecheck": 18217,
    "gate.test": 31002,
    "gate.coverage": 4112,
    "gate.security": 6502,
    "gate.commitMsg": 1273,
    "push": 4218,
    "pr_create": 2891
  },
  "total_ms": 901623
}
```

**Persistent** — `.arandano/bench.csv` (one row appended per run):

```
timestamp,task_id,stack,image_sha,total_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms
```

`worker_gates_ms` is the sum of all `gate.*` durations. The CSV is committable
so baseline + post-improvement runs are diffable in git.

### 3. `packages/cli/src/commands/bench.ts`

```
arandano bench [--task <id>] [--plan <slug>] [--last N]
```

Read-only consumer of `bench.csv`. Prints a table with median + p95 per phase
across the selected runs, plus a "delta vs previous run" column. No mutation,
no network.

### Boundaries

- `PerfRecorder` lives in `@arandano/core` — importable by both host and worker,
  zero dependencies.
- Bench-CSV merger lives in `@arandano/executors-docker` — host owns the final
  merge of host + worker timings and the CSV append.
- `bench` CLI lives in `@arandano/cli` and is read-only.

## Task Breakdown

| #   | Task                                                              | Type         | Est. dev | Est. wall |
| --- | ----------------------------------------------------------------- | ------------ | -------- | --------- |
| T1  | `PerfRecorder` in core (TDD)                                      | code         | 30 min   | —         |
| T2  | Worker `driver.ts` instrumentation + image rebuild                | code + image | 45 min   | —         |
| T3  | Host `DockerExecutor` instrumentation + CSV merger                | code         | 45 min   | —         |
| T4  | `arandano bench` CLI command (TDD)                                | code         | 30 min   | —         |
| T5  | Baseline measurement of three-helpers plan                        | run          | 5 min    | ~25 min   |
| T6  | **Re-brainstorm based on baseline data** (decision gate)          | design       | 30 min   | —         |
| T7  | Improvement A — _tentative_: npm cache volume                     | code + run   | 30 min   | ~25 min   |
| T8  | Improvement B — _tentative_: skip docker pull when digest matches | code + run   | 30 min   | ~25 min   |
| T9  | Improvement C — _tentative_: pre-bake gate tools in worker image  | code + run   | 45 min   | ~25 min   |
| T10 | Summary report — populate Results section with measured deltas    | docs         | 20 min   | —         |

**Total**: ~6 h dev + ~2 h Docker time.

**Sequencing**: T1 → T2 → T3 are strictly ordered (instrumentation must land
before baseline). T4 can land in parallel with T3. T5 must come before T6.
T7/T8/T9 are independent of each other and may be reordered or dropped at the
T6 gate. T10 is last.

### T6 — Decision gate (no code)

After T5 produces a baseline `bench.csv`, T6 reviews it:

1. Run `arandano bench --plan=2026-05-11-three-helpers` and inspect the
   breakdown.
2. For each currently-proposed improvement (A/B/C above): is the affected
   phase actually a meaningful share of total time? Rule of thumb: if the
   target phase is <5% of total, drop the improvement.
3. Identify any **unexpected** large costs the baseline reveals — e.g.
   `gh pr create` latency, gate ordering, container startup overhead, the
   artifact-copy step — and propose new improvements for those.
4. Write a short addendum at the bottom of the implementation plan titled
   **"Improvements to pursue (chosen at T6)"**, listing the final ordered set
   of T7/T8/T9 work.

The addendum is the deliverable from T6. T7+ then implement that list.

## Acceptance Criteria

- [ ] `PerfRecorder` ships in `@arandano/core` with passing tests
- [ ] Every named host and worker phase is captured (see JSON shape above)
- [ ] Each run writes `timings.json` and appends one row to `bench.csv`
- [ ] `arandano bench` prints median/p95 per phase plus delta-vs-previous
- [ ] Baseline `bench.csv` snapshot is committed for future diffing
- [ ] T6 produces a written addendum naming the improvements actually pursued
- [ ] Each pursued improvement is followed by a re-measurement and a recorded
      delta in the Results section
- [ ] **Per-task wall time drops ≥40%** OR the Results section explains why
      the target wasn't met and what's next
- [ ] All existing tests still pass; no correctness regressions

## Out of Scope (explicitly deferred)

- Parallelizing quality gates (moderate complexity, deferred at scope-decision
  time)
- Container reuse across tasks (lifecycle/cleanup complexity)
- Claude Code prompting / tool-call reduction (model behaviour, not infra)
- Multi-machine / distributed runs (Phase 5+ k8s territory)

## Risks & Mitigations

- **Pre-baked gate tools couple the worker image to specific tool versions.**
  Mitigation: only bake widely-shared tools at minimum versions; user
  projects can still install newer versions on top.
- **Skip-pull logic could miss image updates if the digest check is wrong.**
  Mitigation: add a `--force-pull` flag to `run` and `bench` for explicit
  refresh; default behaviour can be made `pull on first run, skip on
subsequent`.
- **Run-to-run variability** (network, Docker state, Claude API latency).
  Mitigation: `bench` reports median across N runs, not single-run; baseline
  takes 2+ runs.

## Renumbering

When this plan lands, the following existing plan files are renamed (no
content change in this commit — content rename happens as part of T0 of the
implementation plan):

| Old                                                      | New                                                      |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `2026-05-08-phase-3-multi-provider-coverage-security.md` | `2026-05-08-phase-4-multi-provider-coverage-security.md` |
| `2026-05-08-phase-4-remote-docker-ci-templates.md`       | `2026-05-08-phase-5-remote-docker-ci-templates.md`       |
| `2026-05-08-phase-5-k8s-executor.md`                     | `2026-05-08-phase-6-k8s-executor.md`                     |
| `2026-05-08-phase-6-daemon-http-sqlite.md`               | `2026-05-08-phase-7-daemon-http-sqlite.md`               |
| `2026-05-08-phase-7-auto-planner-skill.md`               | `2026-05-08-phase-8-auto-planner-skill.md`               |
| `2026-05-08-phase-8-mcp-catalog-examples-polish.md`      | `2026-05-08-phase-9-mcp-catalog-examples-polish.md`      |

The new implementation plan for this design is named
`2026-05-14-phase-3-performance.md`.

Cross-references inside renamed files (e.g. "Phase 3 picks up …") are updated
in the same commit as the rename.
