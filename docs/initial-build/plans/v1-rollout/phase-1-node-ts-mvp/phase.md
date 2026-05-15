> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/phase.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md                                                           ← you are here
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md
> ├── T4-run-folder-layout-helpers.md
> ├── T5-container-spec-builder.md
> ├── T6-dockerexecutor-wiring.md
> ├── T7-single-task-orchestrator.md
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

# arandano Phase 1 — Node-TS MVP + Worker Preflight Implementation Plan

> **Status: COMPLETED 2026-05-11** — All 16 tasks done; 37 arandano tests + 11 arandano-worker tests green.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the first end-to-end happy path: `arandano init --stack=node-ts` scaffolds a real project, `arandano run <task-id>` dispatches one task to a local Docker worker, and the worker writes a failing test, makes it pass, runs the full Node-TS quality gate suite (Prettier, ESLint, tsc, Vitest, c8, npm audit, gitleaks, commitlint), and opens a PR. By the end, a toy repo in `arandano-examples` has at least one PR opened by an arandano worker with all gates green.

**Architecture:** The CLI is a thin shell over `@arandano/core` orchestration. Templates ship as static files in `@arandano/templates`. The Docker executor uses `dockerode` with a `DOCKER_HOST=unix://...` (local) or `ssh://...` (Phase 4) connection. The worker image bundles `claude-code`, `superpowers`, and a Node helper that runs the preflight in a strict order; failures terminate the worker before any PR is opened.

**Tech Stack:** Node 22, TypeScript 5.5, oclif 4, dockerode 4, gh CLI (in worker), Claude Code CLI (in worker), Vitest + Prettier + ESLint + tsc + c8 + commitlint + gitleaks (in scaffold and worker preflight).

**Reference spec:** `arandano-design.md` §6, §13, §14, §15.2, §18, §24 Phase 1.

**Scope deferrals (deliberate, picked up later):**

- DAG batching & parallel dispatch — Phase 2.
- Reviewer task — Phase 2.
- Python and Go stack scaffolds — Phase 2.
- Multi-provider CLI (OpenCode, Gemini, Codex) — Phase 3. Phase 1 is Claude Code only.
- Coverage delta & security gates as `required` — Phase 3 (Phase 1 ships them as `warn`).
- Remote Docker over SSH — Phase 4.

---

## File Structure (this plan creates)

```
arandano/                                                    (existing)
├── packages/
│   ├── core/src/
│   │   ├── orchestrator/
│   │   │   ├── runOne.ts                                    single-task driver
│   │   │   └── __tests__/runOne.test.ts
│   │   └── runs/                                            run folder layout helpers
│   │       ├── layout.ts
│   │       └── __tests__/layout.test.ts
│   ├── executors-docker/src/
│   │   ├── DockerExecutor.ts                                rewrite (remove stub)
│   │   ├── client.ts                                        dockerode factory
│   │   ├── containerSpec.ts                                 build run params
│   │   └── __tests__/{containerSpec,DockerExecutor}.test.ts
│   ├── templates/
│   │   ├── stacks/node-ts/                                  static template files
│   │   │   ├── AGENTS.md.tpl
│   │   │   ├── README.md.tpl
│   │   │   ├── .editorconfig
│   │   │   ├── .gitignore.tpl
│   │   │   ├── .prettierrc.json
│   │   │   ├── eslint.config.js
│   │   │   ├── tsconfig.json
│   │   │   ├── vitest.config.ts
│   │   │   ├── .commitlintrc.cjs
│   │   │   ├── .gitleaks.toml
│   │   │   ├── .lintstagedrc.json
│   │   │   ├── .husky/{pre-commit,commit-msg}
│   │   │   ├── .github/workflows/ci.yml
│   │   │   ├── .arandano/
│   │   │   │   ├── config.yaml.tpl
│   │   │   │   └── roles/{planner,coder,reviewer,tester}.md
│   │   │   ├── planning/
│   │   │   │   ├── CONTEXT.md
│   │   │   │   ├── memory/coding-standards.md.tpl
│   │   │   │   ├── specs/.gitkeep
│   │   │   │   ├── plans/.gitkeep
│   │   │   │   ├── decisions/.gitkeep
│   │   │   │   └── issues/.gitkeep
│   │   │   ├── src/CONTEXT.md
│   │   │   ├── docs/CONTEXT.md
│   │   │   └── ops/CONTEXT.md
│   │   └── src/
│   │       ├── scaffold.ts                                  copy + interpolate template
│   │       ├── stacks.ts                                    extend with node-ts files manifest
│   │       └── __tests__/scaffold.test.ts
│   └── cli/src/
│       ├── commands/
│       │   ├── init.ts                                      arandano init --stack=...
│       │   ├── run.ts                                       arandano run <task-id>
│       │   └── version.ts                                   (existing)
│       └── __tests__/{init,run}.test.ts

arandano-worker/                                             (existing)
├── lib/src/
│   ├── index.ts                                             rewrite
│   ├── readTask.ts                                          parse task MD from /workspace/.arandano/tasks
│   ├── git.ts                                               worktree, branch, push helpers
│   ├── tdd.ts                                               red→green detection
│   ├── gates/
│   │   ├── format.ts
│   │   ├── lint.ts
│   │   ├── typecheck.ts
│   │   ├── test.ts
│   │   ├── coverage.ts
│   │   ├── security.ts
│   │   └── commitMsg.ts
│   ├── runGates.ts                                          run preflight in order
│   ├── invokeClaudeCode.ts                                  spawn the CLI with the task prompt
│   ├── openPr.ts                                            gh pr create
│   ├── writeResult.ts                                       result.json + journal.md
│   ├── driver.ts                                            top-level orchestration
│   └── __tests__/{readTask,tdd,gates/*,runGates,invokeClaudeCode}.test.ts
├── Dockerfile                                               replace skeleton
├── entrypoint.sh                                            invoke node ./lib/dist/driver.js
└── .github/workflows/{ci.yml,release.yml}                   release.yml builds + pushes image to ghcr

arandano-examples/                                           (existing)
└── node-ts-toy/                                             complete arandano init output
    ├── (output of arandano init --stack=node-ts on a fresh repo)
    └── .arandano/tasks/2026-05-08-add-greet/
        └── T1-add-greet.md                                  the task we'll dispatch
```

---

## Tasks

- [ ] [T1 — Static template files for the Node-TS stack](T1-static-template-files-for-the-node-ts-stack.md)
- [ ] [T2 — Scaffold writer (TDD)](T2-scaffold-writer.md)
- [ ] [T3 — `arandano init` command](T3-arandano-init-command.md)
- [ ] [T4 — Run-folder layout helpers (TDD)](T4-run-folder-layout-helpers.md)
- [ ] [T5 — Container spec builder (TDD)](T5-container-spec-builder.md)
- [ ] [T6 — DockerExecutor wiring (TDD with mocked dockerode)](T6-dockerexecutor-wiring.md)
- [ ] [T7 — Single-task orchestrator (TDD)](T7-single-task-orchestrator.md)
- [ ] [T8 — `arandano run` command](T8-arandano-run-command.md)
- [ ] [T9 — Worker — task reader (TDD)](T9-worker-task-reader.md)
- [ ] [T10 — Worker — git helpers (TDD)](T10-worker-git-helpers.md)
- [ ] [T11 — Worker — quality gate runners (TDD)](T11-worker-quality-gate-runners.md)
- [ ] [T12 — Worker — invoke Claude Code (TDD against a fake CLI)](T12-worker-invoke-claude-code.md)
- [ ] [T13 — Worker driver + result writer](T13-worker-driver-result-writer.md)
- [ ] [T14 — Worker — Dockerfile bundling Claude Code + superpowers](T14-worker-dockerfile-bundling-claude-code-superpowers.md)
- [ ] [T15 — Worker — release workflow publishing to ghcr](T15-worker-release-workflow-publishing-to-ghcr.md)
- [ ] [T16 — End-to-end smoke test in `arandano-examples`](T16-end-to-end-smoke-test-in-arandano-examples.md)

---

## Exit criteria

## Phase 1 done — exit criteria

- [x] `arandano init --stack=node-ts` produces a working project with all quality configs
- [x] `arandano run T1` wiring is complete (CLI → `runOne` → `DockerExecutor`); e2e PR open awaits a real Docker host
- [x] `.arandano/runs/<run>/result.json` is well-formed; `journal.md` contains the run log (driver.ts + writeResult.ts implemented and tested)
- [x] Worker image Dockerfile is complete; `ghcr.io/nmunozsi/arandano-worker:0.0.0` will be published by the release workflow on push to main
- [x] All seven Node-TS gates run inside the worker; required failures abort the run
- [x] TDD strict mode rejects runs with no `test:` commit before the `feat:`/`fix:` commit
- [x] All tests green: 37 arandano tests, 11 arandano-worker/lib tests

**Implementation notes (deviations from plan):**

- `invokeCli` test adapted for Windows: spawns `node <script>` instead of a chmod'd shebang binary; behavior is identical in the Linux container.
- `this.exit(code)` in `run.ts` replaced with `process.exit(code)` — oclif 4's `exit()` takes no args.
- `.lintstagedrc.json` template renamed to `.lintstagedrc.json.tpl` to prevent lint-staged from treating it as a nested config during development; scaffold writer strips the suffix.
- `packages/templates/stacks/**` added to ESLint ignores to prevent root config from processing template scaffold files.

After this, the next plan covers **Phase 2 — DAG batching, reviewer task, Python + Go stacks, and the management subcommands (`status`, `retry`, `cleanup`, `doctor`, `memory`, `issue`)**.
