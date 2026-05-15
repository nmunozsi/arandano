> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/phase.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md                                                          ← you are here
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

# arandano Foundations (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap all three arandano repos (`arandano`, `arandano-worker`, `arandano-examples`) with OSS scaffolding, an npm-workspace TypeScript build, self-hosting quality gates, CI, and the package skeletons (`@arandano/core`, `@arandano/executors-docker`, `@arandano/templates`, `@arandano/cli`). Implement the type definitions, MD parser, config loader, and state store in `@arandano/core` with full TDD coverage. After this plan: the monorepo builds, types compile, all tests pass, all three repos exist on GitHub with CI green. No user-facing commands are implemented yet — that's Phase 1.

**Architecture:** Three GitHub repos under `nmunozsi/`. The main monorepo `arandano` is an npm workspace with five packages built with tsup. TypeScript throughout. Vitest for tests. oclif for the CLI (skeleton only this phase). The repo eats its own dog food — every quality gate we ship is enabled on the arandano repo itself (Prettier, ESLint, tsc, Vitest, c8, npm audit, gitleaks, commitlint, husky, lint-staged).

**Tech Stack:** Node 22 LTS, TypeScript 5.5, npm workspaces, tsup, Vitest 1.6, ESLint 9 flat config, Prettier 3, husky 9, lint-staged 15, commitlint, gitleaks, c8, GitHub Actions, semantic-release (configured but not triggered until first release), oclif 4.

**Reference spec:** `arandano-design.md` at repo root — see §3 for decisions, §6 for project scaffold, §15 for quality model, §22 for security, §23 for repo layout, §24 Phase 0.

**Scope deferrals (deliberate, picked up in Phase 1):**

- The worker's TDD preflight implementation, quality-gate runners, and bundling of sandcastle + superpowers + Claude Code into the image. Phase 0 ships a placeholder Dockerfile and `lib/` skeleton so the contract is in place.
- The "sandcastle facade" insulation layer (in `@arandano/executors-docker`). Stubbed here; built in Phase 1 alongside the real executor.
- semantic-release wiring beyond a stub `release.yml`. The first real release runs after Phase 1.

---

## File Structure (this plan creates)

```
arandano/                              (existing repo)
├── LICENSE                            MIT
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md                       semantic-release placeholder
├── .gitignore
├── .nvmrc                             "22"
├── .editorconfig
├── package.json                       npm workspace root
├── tsconfig.base.json
├── vitest.config.ts                   monorepo-wide
├── eslint.config.js                   flat config, monorepo-wide
├── .prettierrc.json
├── .commitlintrc.cjs
├── .gitleaks.toml
├── .lintstagedrc.json
├── .husky/{pre-commit,commit-msg}
├── .github/
│   ├── workflows/{ci.yml,release.yml}
│   ├── ISSUE_TEMPLATE/bug_report.md
│   └── PULL_REQUEST_TEMPLATE.md
├── packages/
│   ├── core/                          types + parsers + config + state
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/{task,role,quality,executor,config,index}.ts
│   │       ├── parsers/task-md.ts
│   │       ├── config/load.ts
│   │       ├── state/store.ts
│   │       └── __tests__/{task-md,config,state}.test.ts
│   ├── executors-docker/              Executor stub
│   │   ├── package.json + tsconfig.json + tsup.config.ts
│   │   └── src/{index.ts, DockerExecutor.ts, __tests__/DockerExecutor.test.ts}
│   ├── templates/                     stack registry stub
│   │   ├── package.json + tsconfig.json + tsup.config.ts
│   │   └── src/{index.ts, stacks.ts, __tests__/stacks.test.ts}
│   ├── skills/                        skill registry stub
│   │   ├── package.json + tsconfig.json + tsup.config.ts
│   │   └── src/{index.ts, registry.ts, __tests__/registry.test.ts}
│   └── cli/                           oclif skeleton
│       ├── package.json + tsconfig.json + tsup.config.ts
│       └── src/{bin.ts, cli.ts, commands/version.ts, __tests__/cli.test.ts}
└── docs/
    ├── architecture.md                links to ../arandano-design.md
    └── plans/2026-05-08-arandano-foundations.md  (this file)


arandano-worker/                       (new — gh repo create)
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── .gitignore
├── Dockerfile                         multi-stage skeleton (filled in Phase 1)
├── entrypoint.sh                      placeholder
├── lib/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/{index.ts, __tests__/smoke.test.ts}
└── .github/workflows/ci.yml


arandano-examples/                     (new — gh repo create)
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── .gitignore
```

---

## Tasks

- [ ] [T1 — Initialize the `arandano` monorepo with OSS bootstrap files](T1-initialize-the-arandano-monorepo-with-oss-bootstra.md)
- [ ] [T2 — npm workspace + TypeScript base build](T2-npm-workspace-typescript-base-build.md)
- [ ] [T3 — Self-hosting quality gates (lint, format, hooks, secrets, coverage, commitlint)](T3-self-hosting-quality-gates.md)
- [ ] [T4 — CI workflow](T4-ci-workflow.md)
- [ ] [T5 — Scaffold `@arandano/core` with one passing smoke test](T5-scaffold-arandano-core-with-one-passing-smoke-test.md)
- [ ] [T6 — Define core types in `@arandano/core`](T6-define-core-types-in-arandano-core.md)
- [ ] [T7 — Implement task-md parser (TDD)](T7-implement-task-md-parser.md)
- [ ] [T8 — Implement config loader (TDD)](T8-implement-config-loader.md)
- [ ] [T9 — Implement run state store (TDD)](T9-implement-run-state-store.md)
- [ ] [T10 — Scaffold remaining packages (`executors-docker`, `templates`, `skills`, `cli`)](T10-scaffold-remaining-packages.md)
- [ ] [T11 — Bootstrap `arandano-worker` repo](T11-bootstrap-arandano-worker-repo.md)
- [ ] [T12 — Bootstrap `arandano-examples` repo](T12-bootstrap-arandano-examples-repo.md)

---

## Exit criteria

## Phase 0 done — exit criteria

- [x] `https://github.com/nmunozsi/arandano` has CI green on `main` with all quality gates running
- [x] `npm ci && npm run build && npm test` succeeds locally
- [x] `@arandano/core` exports `VERSION`, parses task MDs, loads configs, manages run state — all with passing TDD-authored tests
- [x] `@arandano/executors-docker`, `@arandano/templates`, `@arandano/skills`, `@arandano/cli` all exist as buildable, type-safe stub packages
- [x] `https://github.com/nmunozsi/arandano-worker` has CI green; placeholder Docker image builds and runs
- [x] `https://github.com/nmunozsi/arandano-examples` exists with README listing planned examples
- [x] All three repos carry MIT LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT
- [x] commitlint + husky enforce conventional commits in `arandano`
- [x] `gitleaks` runs in CI for `arandano`

After this, the next plan covers **Phase 1: Single-task MVP, Node-TS stack, worker preflight** — implements `arandano init --stack=node-ts` and `arandano run <task-id>` end-to-end against local Docker.
