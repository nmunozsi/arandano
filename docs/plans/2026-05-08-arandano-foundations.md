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

### Task 1: Initialize the `arandano` monorepo with OSS bootstrap files

**Goal:** Take the existing GitHub repo at `https://github.com/nmunozsi/arandano` and the local working folder (which is already named `arandano`) and produce a clean initial commit on `main` with all OSS scaffolding.

**Files:**

- Create: `LICENSE`
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`

- [x] **Step 1: Verify gh auth and repo access**

```bash
gh auth status
gh repo view nmunozsi/arandano --json name,owner
```

Expected: authenticated as `nmunozsi`; repo visible.

- [x] **Step 2: If the working folder is not yet a git clone of the remote, attach it**

```bash
git init
git remote add origin https://github.com/nmunozsi/arandano.git
git fetch origin
# If main already exists remotely with content, hard-reset to it; otherwise create main.
git checkout -B main
```

Expected: `git status` shows we're on `main` with the existing files (`arandano-design.md`, `skool.md.ini`, `video_transcription.txt`).

- [x] **Step 3: Create `LICENSE` (MIT, year 2026, holder Nicolás Muñoz Silva)**

Use the standard MIT template from https://opensource.org/license/mit (substitute `2026 Nicolás Muñoz Silva`).

- [x] **Step 4: Create `.gitignore`**

```gitignore
# Node
node_modules/
dist/
coverage/
*.tsbuildinfo
.npm/
.pnpm-store/
.yarn/

# arandano
.arandano/state.json
.arandano/runs/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Env
.env
.env.local
.env.*.local
```

- [x] **Step 5: Create `.nvmrc` (single line)**

```
22
```

- [x] **Step 6: Create `.editorconfig`**

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [x] **Step 7: Create `README.md`**

```markdown
# arandano

> Build software with coding agents. Reusable, MIT-licensed.

`arandano` is an open-source system that combines [superpowers](https://github.com/obra/superpowers), [sandcastle](https://github.com/mattpocock/sandcastle), and a markdown-as-database project structure to let you spec, plan, and dispatch software-engineering tasks to coding agents running in Docker containers on your homelab.

## Status

Pre-alpha. See [docs/architecture.md](docs/architecture.md) for the design and [docs/plans/](docs/plans/) for implementation plans.

## License

MIT. See [LICENSE](LICENSE).
```

- [x] **Step 8: Create `CONTRIBUTING.md`**

````markdown
# Contributing to arandano

Thanks for your interest. arandano is in early development; APIs and structures will change.

## Workflow

1. Open an issue describing the change you want to make.
2. Fork, branch (`feat/<short-slug>` or `fix/<short-slug>`), and open a PR against `main`.
3. Conventional Commits required (commitlint enforces).
4. All PRs run the full quality gate suite (lint, types, tests, coverage, security). All gates must pass.
5. By contributing, you agree your contributions are licensed under the MIT License.

## Development setup

```bash
nvm use            # Node 22
npm ci
npm run build
npm test
```
````

````

- [x] **Step 9: Create `CODE_OF_CONDUCT.md`**

Use the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) with `nmunozsi@gmail.com` as the contact.

- [x] **Step 10: Create `CHANGELOG.md` (semantic-release will manage)**

```markdown
# Changelog

All notable changes will be documented here. This file is auto-generated by semantic-release once the first release ships.
````

- [x] **Step 11: Create `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/bug_report.md`**

`PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

<one or two lines>

## Linked task

<.arandano/tasks/<plan>/T<n>-<slug>.md or planning/issues/...>

## Quality gates (filled by worker preflight if agent-authored)

- [x] Format
- [x] Lint
- [x] Typecheck
- [x] Tests
- [x] Coverage
- [x] Security
- [x] Conventional commit messages
```

`ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Report a defect
labels: bug
---

## What happened

## What I expected

## Reproduction

## Environment

- arandano version:
- OS:
- Node:
```

- [x] **Step 12: Commit and push**

```bash
git add LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md .gitignore .nvmrc .editorconfig .github/
git commit -m "chore: bootstrap repository with OSS scaffolding"
git push -u origin main
```

Expected: push succeeds. `gh repo view --web` shows README rendered.

---

### Task 2: npm workspace + TypeScript base build

**Goal:** A buildable monorepo. `npm ci && npm run build` succeeds; tsup produces dist/ for every package.

**Files:**

- Create: `package.json` (workspace root)
- Create: `tsconfig.base.json`
- Create: `tsup.config.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`

- [x] **Step 1: Create root `package.json`**

```json
{
  "name": "arandano-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run -ws build --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "typecheck": "tsc -b",
    "coverage": "vitest run --coverage",
    "audit": "npm audit --audit-level=high",
    "secrets": "gitleaks detect --no-banner --redact",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@vitest/coverage-v8": "^1.6.0",
    "tsup": "^8.2.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [x] **Step 3: Create root `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

- [x] **Step 4: Create `packages/core/package.json`**

```json
{
  "name": "@arandano/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "yaml": "^2.5.0",
    "zod": "^3.23.0"
  },
  "publishConfig": { "access": "public" }
}
```

- [x] **Step 5: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

- [x] **Step 6: Create `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

- [x] **Step 7: Create `packages/core/src/index.ts` placeholder**

```ts
export const VERSION = '0.0.0';
```

- [x] **Step 8: Install and verify build**

```bash
npm ci
npm run build
```

Expected: `npm ci` succeeds; `npm run build` produces `packages/core/dist/index.js` and `index.d.ts`.

- [x] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts packages/core/
git commit -m "build: scaffold npm workspace and tsup build for @arandano/core"
```

---

### Task 3: Self-hosting quality gates (lint, format, hooks, secrets, coverage, commitlint)

**Goal:** The arandano repo enforces the same gates we'll ship to users — Prettier, ESLint, husky, commitlint, lint-staged, gitleaks. `npm run lint` / `format` / `typecheck` / `test` / `audit` / `secrets` all green on a clean working tree.

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.commitlintrc.cjs`
- Create: `.gitleaks.toml`
- Create: `.lintstagedrc.json`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Modify: `package.json` (add devDependencies + husky `prepare`)

- [x] **Step 1: Add lint/format/hook devDependencies**

```bash
npm install -D --save-exact \
  eslint@9.9.0 typescript-eslint@8.2.0 \
  prettier@3.3.3 \
  @commitlint/cli@19.4.0 @commitlint/config-conventional@19.2.2 \
  husky@9.1.4 lint-staged@15.2.9
```

- [x] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [x] **Step 3: Create `eslint.config.js` (flat config)**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
```

- [x] **Step 4: Create `.commitlintrc.cjs`**

```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

- [x] **Step 5: Create `.gitleaks.toml`**

```toml
title = "arandano gitleaks config"

[allowlist]
description = "Allowlist for arandano"
paths = [
  '''node_modules/''',
  '''dist/''',
  '''package-lock\.json''',
]
```

- [x] **Step 6: Create `.lintstagedrc.json`**

```json
{
  "*.{ts,tsx,js,cjs,mjs}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

- [x] **Step 7: Initialize husky and create hooks**

```bash
npx husky init
```

This creates `.husky/pre-commit` with a default. Replace its contents:

`.husky/pre-commit`:

```sh
npx lint-staged
```

Create `.husky/commit-msg`:

```sh
npx --no -- commitlint --edit "$1"
```

```bash
chmod +x .husky/commit-msg
```

- [x] **Step 8: Run all gates locally to verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run audit
```

Expected: all succeed. (Tests will report "no test files found" — acceptable until Task 5 adds one.)

- [x] **Step 9: Test the commit hook**

Make a deliberately bad commit message to verify commitlint blocks it:

```bash
git add .
git commit -m "bad message"
```

Expected: blocked by commit-msg hook. Then commit properly:

```bash
git commit -m "build: enable lint, format, husky, commitlint, and lint-staged"
```

Expected: passes hooks; commit succeeds.

---

### Task 4: CI workflow

**Goal:** Every push and PR runs the full gate suite on GitHub Actions.

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml` (stub)

- [x] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run format
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
      - run: npm run audit
      - name: gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [x] **Step 2: Create `.github/workflows/release.yml` (stub — wired up in a later phase)**

```yaml
name: Release

on:
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo "semantic-release wiring is added in a later phase"
```

- [x] **Step 3: Push and verify CI**

```bash
git checkout -b ci/initial-workflow
git add .github/workflows/
git commit -m "ci: add quality gate workflow"
git push -u origin ci/initial-workflow
gh pr create --fill
```

Watch the run:

```bash
gh pr checks --watch
```

Expected: all steps green. Merge:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull
```

---

### Task 5: Scaffold `@arandano/core` with one passing smoke test

**Goal:** `@arandano/core` package has a real test runner integrated. Adds the first Vitest test file so the test runner stops reporting "no tests found".

**Files:**

- Create: `packages/core/src/__tests__/version.test.ts`

- [x] **Step 1: Write the failing test**

`packages/core/src/__tests__/version.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../index.js';

describe('@arandano/core', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [x] **Step 2: Run the test to verify it passes**

```bash
npm test
```

Expected: 1 test file, 1 test passing. (`VERSION` is `'0.0.0'` from Task 2 step 7, which matches the regex.)

- [x] **Step 3: Commit**

```bash
git add packages/core/src/__tests__/version.test.ts
git commit -m "test(core): add VERSION smoke test"
```

---

### Task 6: Define core types in `@arandano/core`

**Goal:** Concrete TypeScript types for everything the orchestrator and worker need. No business logic yet — just the contract.

**Files:**

- Create: `packages/core/src/types/quality.ts`
- Create: `packages/core/src/types/task.ts`
- Create: `packages/core/src/types/role.ts`
- Create: `packages/core/src/types/executor.ts`
- Create: `packages/core/src/types/config.ts`
- Create: `packages/core/src/types/index.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Create `packages/core/src/types/quality.ts`**

```ts
export type GateMode = 'required' | 'warn' | 'skip';
export type CommitMsgStyle = 'conventional' | 'freeform' | 'skip';
export type CoverageDelta = 'nonneg' | 'any';

export interface QualitySpec {
  format: GateMode;
  lint: GateMode;
  typecheck: GateMode;
  test: GateMode;
  coverage: { min: number; delta: CoverageDelta };
  security: GateMode;
  commit_msg: CommitMsgStyle;
  reviewer_required: boolean;
}
```

- [x] **Step 2: Create `packages/core/src/types/task.ts`**

```ts
import type { QualitySpec } from './quality.js';

export type TddMode = 'strict' | 'relaxed';

export interface TaskFrontmatter {
  id: string;
  title: string;
  depends_on?: string[];
  role: string;
  cli?: string;
  model?: string;
  tdd?: TddMode;
  timeout_minutes?: number;
  mcp?: string[];
  tests?: string[];
  acceptance?: string[];
  quality?: Partial<QualitySpec>;
}

export interface TaskMd {
  frontmatter: TaskFrontmatter;
  body: string;
  filePath: string;
}
```

- [x] **Step 3: Create `packages/core/src/types/role.ts`**

```ts
import type { TddMode } from './task.js';

export interface RoleFrontmatter {
  name: string;
  cli: string;
  model: string;
  tdd?: TddMode;
}

export interface RoleMd {
  frontmatter: RoleFrontmatter;
  body: string;
  filePath: string;
}
```

- [x] **Step 4: Create `packages/core/src/types/executor.ts`**

```ts
import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export interface TaskRun {
  taskId: string;
  taskMdPath: string;
  rolePath: string;
  contextPaths: string[];
  cli: string;
  model: string;
  tdd: TddMode;
  quality: QualitySpec;
  envPass: string[];
  workdir: string;
  timeoutMs: number;
  mcpServers: string[];
}

export type ExitReason =
  | 'ok'
  | 'timeout'
  | 'rate_limit'
  | 'error'
  | 'tdd_violation'
  | 'quality_violation';

export interface ExitResult {
  exitCode: number;
  reason: ExitReason;
  resultJsonPath?: string;
  journalPath?: string;
}

export interface Handle {
  id: string;
}

export interface Executor {
  start(task: TaskRun): Promise<Handle>;
  wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult>;
  logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string>;
  cancel(h: Handle): Promise<void>;
}
```

- [x] **Step 5: Create `packages/core/src/types/config.ts`**

```ts
import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export type ExecutorBackend = 'docker' | 'k8s' | 'local';
export type Forge = 'github' | 'forgejo' | 'gitlab' | 'none';
export type Stack = 'node-ts' | 'python' | 'go' | 'polyglot';

export interface DockerExecutorConfig {
  host?: string;
  image: string;
  workdir: string;
  plugins_mount: 'baked-in' | string;
  env_pass: string[];
}

export interface ExecutorConfig {
  backend: ExecutorBackend;
  docker?: DockerExecutorConfig;
}

export interface GitConfig {
  forge: Forge;
  remote: string;
  branch_prefix: string;
  open_pr: boolean;
}

export interface RoleConfig {
  cli: string;
  model: string;
  tdd?: TddMode;
}

export interface McpConfig {
  enabled: boolean;
  transport: 'stdio' | 'sse';
  image?: string;
  url?: string;
}

export interface BatchingConfig {
  max_parallel: number;
  timeout_minutes: number;
  retry_policy: {
    max_attempts: number;
    on: Array<'container_error' | 'network_error' | 'provider_rate_limit'>;
  };
}

export interface ProjectMeta {
  name: string;
  default_branch: string;
  license?: string;
  stack?: Stack;
}

export interface ProjectConfig {
  project: ProjectMeta;
  executor: ExecutorConfig;
  git: GitConfig;
  roles: Record<string, RoleConfig>;
  mcp?: Record<string, McpConfig>;
  quality_defaults: QualitySpec;
  batching: BatchingConfig;
}
```

- [x] **Step 6: Create `packages/core/src/types/index.ts`**

```ts
export * from './quality.js';
export * from './task.js';
export * from './role.js';
export * from './executor.js';
export * from './config.js';
```

- [x] **Step 7: Update `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
```

- [x] **Step 8: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [x] **Step 9: Commit**

```bash
git add packages/core/src/types/ packages/core/src/index.ts
git commit -m "feat(core): define task, role, quality, executor, and config types"
```

---

### Task 7: Implement task-md parser (TDD)

**Goal:** Parse a task markdown file (frontmatter via gray-matter + body) and validate required fields. Throws meaningful errors on missing/invalid input.

**Files:**

- Create: `packages/core/src/parsers/task-md.ts`
- Create: `packages/core/src/__tests__/task-md.test.ts`
- Modify: `packages/core/src/index.ts` (export the parser)

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/task-md.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTaskMd } from '../parsers/task-md.js';

describe('parseTaskMd', () => {
  it('parses valid frontmatter and body', () => {
    const input = [
      '---',
      'id: T1',
      'title: Implement foo',
      'role: coder',
      'depends_on: [T0]',
      'tdd: strict',
      '---',
      '',
      '## Context',
      'do the thing',
    ].join('\n');

    const result = parseTaskMd(input, '/abs/T1.md');

    expect(result.frontmatter.id).toBe('T1');
    expect(result.frontmatter.title).toBe('Implement foo');
    expect(result.frontmatter.role).toBe('coder');
    expect(result.frontmatter.depends_on).toEqual(['T0']);
    expect(result.frontmatter.tdd).toBe('strict');
    expect(result.body).toContain('do the thing');
    expect(result.filePath).toBe('/abs/T1.md');
  });

  it('throws when required field id is missing', () => {
    const input = '---\ntitle: x\nrole: coder\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/id/);
  });

  it('throws when required field title is missing', () => {
    const input = '---\nid: T1\nrole: coder\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/title/);
  });

  it('throws when required field role is missing', () => {
    const input = '---\nid: T1\ntitle: x\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/role/);
  });

  it('rejects invalid tdd value', () => {
    const input = '---\nid: T1\ntitle: x\nrole: coder\ntdd: chaos\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/tdd/);
  });

  it('accepts minimal valid input', () => {
    const input = '---\nid: T1\ntitle: x\nrole: coder\n---\n';
    const result = parseTaskMd(input, '/x.md');
    expect(result.frontmatter.depends_on).toBeUndefined();
    expect(result.body.trim()).toBe('');
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- task-md
```

Expected: tests fail with "Cannot find module" or similar (parser file does not exist yet).

- [x] **Step 3: Implement `packages/core/src/parsers/task-md.ts`**

```ts
import matter from 'gray-matter';
import { z } from 'zod';
import type { TaskFrontmatter, TaskMd } from '../types/task.js';

const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  role: z.string().min(1),
  depends_on: z.array(z.string()).optional(),
  cli: z.string().optional(),
  model: z.string().optional(),
  tdd: z.enum(['strict', 'relaxed']).optional(),
  timeout_minutes: z.number().int().positive().optional(),
  mcp: z.array(z.string()).optional(),
  tests: z.array(z.string()).optional(),
  acceptance: z.array(z.string()).optional(),
  quality: z.record(z.unknown()).optional(),
});

export function parseTaskMd(content: string, filePath: string): TaskMd {
  const { data, content: body } = matter(content);
  const parsed = TaskFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid task frontmatter in ${filePath}: ${issues}`);
  }
  return {
    frontmatter: parsed.data as TaskFrontmatter,
    body,
    filePath,
  };
}
```

- [x] **Step 4: Export the parser from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
```

- [x] **Step 5: Run the tests to verify they pass**

```bash
npm test -- task-md
```

Expected: all 6 tests pass.

- [x] **Step 6: Verify lint and typecheck**

```bash
npm run lint
npm run typecheck
```

Expected: clean.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/parsers/ packages/core/src/__tests__/task-md.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse and validate task markdown frontmatter"
```

---

### Task 8: Implement config loader (TDD)

**Goal:** Read `.arandano/config.yaml`, parse YAML, and validate against the schema. Returns a strongly-typed `ProjectConfig`.

**Files:**

- Create: `packages/core/src/config/load.ts`
- Create: `packages/core/src/__tests__/config.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load.js';

const validYaml = `
project:
  name: my-app
  default_branch: main
  stack: node-ts
executor:
  backend: docker
  docker:
    image: ghcr.io/nmunozsi/arandano-worker:0.0.0
    workdir: /workspace
    plugins_mount: baked-in
    env_pass: [GH_TOKEN]
git:
  forge: github
  remote: origin
  branch_prefix: agent/
  open_pr: true
roles:
  coder:
    cli: claude-code
    model: claude-sonnet-4-6
    tdd: strict
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: nonneg }
  security: required
  commit_msg: conventional
  reviewer_required: true
batching:
  max_parallel: 3
  timeout_minutes: 45
  retry_policy:
    max_attempts: 2
    on: [container_error, network_error]
`;

describe('loadConfig', () => {
  it('parses a valid config', () => {
    const cfg = loadConfig(validYaml);
    expect(cfg.project.name).toBe('my-app');
    expect(cfg.executor.backend).toBe('docker');
    expect(cfg.executor.docker?.image).toContain('arandano-worker');
    expect(cfg.roles.coder?.tdd).toBe('strict');
    expect(cfg.quality_defaults.coverage.min).toBe(80);
  });

  it('throws on missing project.name', () => {
    const bad = validYaml.replace('name: my-app', '');
    expect(() => loadConfig(bad)).toThrow(/project\.name|name/);
  });

  it('throws on invalid executor.backend', () => {
    const bad = validYaml.replace('backend: docker', 'backend: nope');
    expect(() => loadConfig(bad)).toThrow(/backend/);
  });

  it('throws on invalid quality coverage delta', () => {
    const bad = validYaml.replace('delta: nonneg', 'delta: lol');
    expect(() => loadConfig(bad)).toThrow(/delta/);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- config.test
```

Expected: fail (`loadConfig` not found).

- [x] **Step 3: Implement `packages/core/src/config/load.ts`**

```ts
import yaml from 'yaml';
import { z } from 'zod';
import type { ProjectConfig } from '../types/config.js';

const GateMode = z.enum(['required', 'warn', 'skip']);

const QualitySpecSchema = z.object({
  format: GateMode,
  lint: GateMode,
  typecheck: GateMode,
  test: GateMode,
  coverage: z.object({
    min: z.number().int().min(0).max(100),
    delta: z.enum(['nonneg', 'any']),
  }),
  security: GateMode,
  commit_msg: z.enum(['conventional', 'freeform', 'skip']),
  reviewer_required: z.boolean(),
});

const RoleConfigSchema = z.object({
  cli: z.string().min(1),
  model: z.string().min(1),
  tdd: z.enum(['strict', 'relaxed']).optional(),
});

const DockerExecutorSchema = z.object({
  host: z.string().optional(),
  image: z.string().min(1),
  workdir: z.string().min(1),
  plugins_mount: z.string().min(1),
  env_pass: z.array(z.string()),
});

const ExecutorSchema = z.object({
  backend: z.enum(['docker', 'k8s', 'local']),
  docker: DockerExecutorSchema.optional(),
});

const GitSchema = z.object({
  forge: z.enum(['github', 'forgejo', 'gitlab', 'none']),
  remote: z.string().min(1),
  branch_prefix: z.string().min(1),
  open_pr: z.boolean(),
});

const McpSchema = z.object({
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'sse']),
  image: z.string().optional(),
  url: z.string().optional(),
});

const BatchingSchema = z.object({
  max_parallel: z.number().int().positive(),
  timeout_minutes: z.number().int().positive(),
  retry_policy: z.object({
    max_attempts: z.number().int().min(0),
    on: z.array(z.enum(['container_error', 'network_error', 'provider_rate_limit'])),
  }),
});

const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  default_branch: z.string().min(1),
  license: z.string().optional(),
  stack: z.enum(['node-ts', 'python', 'go', 'polyglot']).optional(),
});

const ProjectConfigSchema = z.object({
  project: ProjectMetaSchema,
  executor: ExecutorSchema,
  git: GitSchema,
  roles: z.record(RoleConfigSchema),
  mcp: z.record(McpSchema).optional(),
  quality_defaults: QualitySpecSchema,
  batching: BatchingSchema,
});

export function loadConfig(yamlText: string): ProjectConfig {
  const parsed = yaml.parse(yamlText);
  const result = ProjectConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid arandano config: ${issues}`);
  }
  return result.data as ProjectConfig;
}
```

- [x] **Step 4: Export from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
export { loadConfig } from './config/load.js';
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- config.test
```

Expected: all 4 tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/config/ packages/core/src/__tests__/config.test.ts packages/core/src/index.ts
git commit -m "feat(core): load and validate .arandano/config.yaml"
```

---

### Task 9: Implement run state store (TDD)

**Goal:** A small, atomic JSON file at `.arandano/state.json` tracking per-task status, branch, PR URL, retry count.

**Files:**

- Create: `packages/core/src/state/store.ts`
- Create: `packages/core/src/__tests__/state.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/state.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../state/store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-state-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('StateStore', () => {
  it('reads an empty state when file does not exist', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    const state = await store.read();
    expect(state.tasks).toEqual({});
  });

  it('writes and re-reads task status', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    await store.update('T1', { status: 'in_progress' });
    const state = await store.read();
    expect(state.tasks.T1?.status).toBe('in_progress');
  });

  it('preserves unrelated tasks when updating one', async () => {
    const store = new StateStore(join(dir, 'state.json'));
    await store.update('T1', { status: 'completed', branch: 'agent/T1-x' });
    await store.update('T2', { status: 'failed' });
    const state = await store.read();
    expect(state.tasks.T1?.status).toBe('completed');
    expect(state.tasks.T1?.branch).toBe('agent/T1-x');
    expect(state.tasks.T2?.status).toBe('failed');
  });

  it('write is atomic (no partial files on crash simulation)', async () => {
    const path = join(dir, 'state.json');
    const store = new StateStore(path);
    await store.update('T1', { status: 'completed' });
    const text = await readFile(path, 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- state.test
```

Expected: fail (`StateStore` not found).

- [x] **Step 3: Implement `packages/core/src/state/store.ts`**

```ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'failed' | 'partial';

export interface TaskState {
  status: TaskStatus;
  branch?: string;
  pr_url?: string;
  attempts?: number;
  last_error?: string;
}

export interface RunState {
  tasks: Record<string, TaskState>;
}

const EMPTY: RunState = { tasks: {} };

export class StateStore {
  constructor(private readonly path: string) {}

  async read(): Promise<RunState> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(text) as Partial<RunState>;
      return { tasks: parsed.tasks ?? {} };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
      throw err;
    }
  }

  async update(taskId: string, patch: Partial<TaskState>): Promise<void> {
    const current = await this.read();
    const existing = current.tasks[taskId] ?? { status: 'pending' as const };
    const next: RunState = {
      tasks: { ...current.tasks, [taskId]: { ...existing, ...patch } },
    };
    await this.writeAtomic(next);
  }

  private async writeAtomic(state: RunState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, this.path);
  }
}
```

- [x] **Step 4: Export from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
export { loadConfig } from './config/load.js';
export { StateStore } from './state/store.js';
export type { RunState, TaskState, TaskStatus } from './state/store.js';
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- state.test
```

Expected: all 4 tests pass.

- [x] **Step 6: Run all gates one more time before commit**

```bash
npm run lint && npm run typecheck && npm test && npm run audit
```

Expected: all green.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/state/ packages/core/src/__tests__/state.test.ts packages/core/src/index.ts
git commit -m "feat(core): atomic state store for run tracking"
```

---

### Task 10: Scaffold remaining packages (`executors-docker`, `templates`, `skills`, `cli`)

**Goal:** Four more packages exist under `packages/`, build, type-check, and have one passing smoke test each. No real logic yet — Phase 1 fills these in.

**Files:**

- Create: `packages/executors-docker/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/DockerExecutor.ts, src/__tests__/DockerExecutor.test.ts}`
- Create: `packages/templates/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/stacks.ts, src/__tests__/stacks.test.ts}`
- Create: `packages/skills/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/registry.ts, src/__tests__/registry.test.ts}`
- Create: `packages/cli/{package.json, tsconfig.json, tsup.config.ts, src/bin.ts, src/cli.ts, src/__tests__/cli.test.ts}`

- [x] **Step 1: Create `packages/executors-docker/package.json`**

```json
{
  "name": "@arandano/executors-docker",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0"
  }
}
```

`packages/executors-docker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

`packages/executors-docker/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

- [x] **Step 2: Create `packages/executors-docker/src/DockerExecutor.ts` (stub)**

```ts
import type { Executor, Handle, ExitResult, TaskRun } from '@arandano/core';

export class DockerExecutor implements Executor {
  start(_task: TaskRun): Promise<Handle> {
    throw new Error('DockerExecutor.start: not implemented (Phase 1)');
  }
  wait(_h: Handle, _opts?: { timeoutMs: number }): Promise<ExitResult> {
    throw new Error('DockerExecutor.wait: not implemented (Phase 1)');
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async *logs(_h: Handle, _opts?: { follow: boolean }): AsyncIterable<string> {
    throw new Error('DockerExecutor.logs: not implemented (Phase 1)');
  }
  cancel(_h: Handle): Promise<void> {
    throw new Error('DockerExecutor.cancel: not implemented (Phase 1)');
  }
}
```

`packages/executors-docker/src/index.ts`:

```ts
export { DockerExecutor } from './DockerExecutor.js';
```

- [x] **Step 3: Smoke test for executors-docker**

`packages/executors-docker/src/__tests__/DockerExecutor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';

describe('DockerExecutor (Phase 0 stub)', () => {
  it('throws not implemented for start', async () => {
    const e = new DockerExecutor();
    await expect(
      e.start({
        taskId: 'T1',
        taskMdPath: '',
        rolePath: '',
        contextPaths: [],
        cli: 'claude-code',
        model: 'x',
        tdd: 'strict',
        quality: {
          format: 'required',
          lint: 'required',
          typecheck: 'required',
          test: 'required',
          coverage: { min: 80, delta: 'nonneg' },
          security: 'required',
          commit_msg: 'conventional',
          reviewer_required: true,
        },
        envPass: [],
        workdir: '/x',
        timeoutMs: 1000,
        mcpServers: [],
      }),
    ).rejects.toThrow(/not implemented/);
  });
});
```

- [x] **Step 4: Create `packages/templates` (similar shape)**

`packages/templates/package.json`:

```json
{
  "name": "@arandano/templates",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "stacks", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0"
  }
}
```

`packages/templates/tsconfig.json`, `tsup.config.ts`: mirror executors-docker.

`packages/templates/src/stacks.ts`:

```ts
import type { Stack } from '@arandano/core';

export const SUPPORTED_STACKS: Stack[] = ['node-ts', 'python', 'go', 'polyglot'];

export function isSupportedStack(s: string): s is Stack {
  return (SUPPORTED_STACKS as string[]).includes(s);
}
```

`packages/templates/src/index.ts`:

```ts
export { SUPPORTED_STACKS, isSupportedStack } from './stacks.js';
```

`packages/templates/src/__tests__/stacks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SUPPORTED_STACKS, isSupportedStack } from '../stacks.js';

describe('templates stack registry', () => {
  it('lists the four supported stacks', () => {
    expect(SUPPORTED_STACKS).toEqual(['node-ts', 'python', 'go', 'polyglot']);
  });

  it('isSupportedStack accepts known and rejects unknown', () => {
    expect(isSupportedStack('node-ts')).toBe(true);
    expect(isSupportedStack('rust')).toBe(false);
  });
});
```

- [x] **Step 4b: Create `packages/skills` (registry stub)**

`packages/skills/package.json`:

```json
{
  "name": "@arandano/skills",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "skills", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/skills/tsconfig.json`, `tsup.config.ts`: mirror executors-docker.

`packages/skills/src/registry.ts`:

```ts
export interface SkillMeta {
  name: string;
  description: string;
}

// Phase 1 fills this in with real skill definitions; Phase 0 just ships the registry shape.
export const BUNDLED_SKILLS: SkillMeta[] = [];
```

`packages/skills/src/index.ts`:

```ts
export { BUNDLED_SKILLS } from './registry.js';
export type { SkillMeta } from './registry.js';
```

`packages/skills/src/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUNDLED_SKILLS } from '../registry.js';

describe('@arandano/skills (Phase 0 registry stub)', () => {
  it('exports an array (empty in Phase 0)', () => {
    expect(Array.isArray(BUNDLED_SKILLS)).toBe(true);
  });
});
```

- [x] **Step 5: Create `packages/cli` with oclif skeleton**

```bash
npm install oclif@4 @oclif/core@4 -w packages/cli
```

(If `npm install -w` flagging fails because the package doesn't exist yet, first create `packages/cli/package.json` then run install.)

`packages/cli/package.json`:

```json
{
  "name": "@arandano/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "arandano": "./dist/bin.js" },
  "main": "./dist/cli.js",
  "types": "./dist/cli.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0",
    "@arandano/executors-docker": "0.0.0",
    "@arandano/templates": "0.0.0",
    "@oclif/core": "^4.0.0"
  },
  "oclif": {
    "bin": "arandano",
    "commands": "./dist/commands"
  }
}
```

`packages/cli/tsconfig.json`, `tsup.config.ts`: mirror others; `tsup.config.ts` adds `bin.ts` to the entry list:

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/bin.ts', 'src/cli.ts', 'src/commands/*.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

`packages/cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { execute } from '@oclif/core';

await execute({ dir: import.meta.url });
```

`packages/cli/src/cli.ts`:

```ts
export const APP_NAME = 'arandano';
```

`packages/cli/src/commands/version.ts`:

```ts
import { Command } from '@oclif/core';
import { VERSION } from '@arandano/core';

export default class Version extends Command {
  static override description = 'Show the arandano version';
  async run(): Promise<void> {
    this.log(`arandano ${VERSION}`);
  }
}
```

`packages/cli/src/__tests__/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../cli.js';

describe('@arandano/cli (Phase 0 skeleton)', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('arandano');
  });
});
```

- [x] **Step 6: Build the workspace and run tests**

```bash
npm install     # picks up new packages and links workspace deps
npm run build
npm test
```

Expected: all packages build; all tests pass.

- [x] **Step 7: Run all gates one more time**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run audit
```

Expected: all green.

- [x] **Step 8: Commit**

```bash
git add packages/executors-docker/ packages/templates/ packages/skills/ packages/cli/ package-lock.json package.json
git commit -m "feat: scaffold executors-docker, templates, skills, and cli packages"
```

- [x] **Step 9: Open PR (or push to main if branch protection isn't enforced yet)**

```bash
git push origin main
# or, if branch protection is on:
git checkout -b feat/scaffold-packages
git push -u origin feat/scaffold-packages
gh pr create --fill
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

### Task 11: Bootstrap `arandano-worker` repo

**Goal:** A second GitHub repo exists with the same OSS scaffolding plus a Dockerfile skeleton, an entrypoint placeholder, and a small Node helper package shape. CI is green on first push (it just builds the placeholder image and runs the placeholder test).

**Files:**

- Create (in a sibling working directory `../arandano-worker/`): `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.gitignore`, `Dockerfile`, `entrypoint.sh`, `lib/package.json`, `lib/tsconfig.json`, `lib/src/index.ts`, `lib/src/__tests__/smoke.test.ts`, `.github/workflows/ci.yml`

- [x] **Step 1: Create the repo on GitHub**

```bash
gh repo create nmunozsi/arandano-worker \
  --public \
  --license MIT \
  --description "OCI image for arandano coding-agent workers — sandcastle + superpowers + quality gates"
```

- [x] **Step 2: Clone it as a sibling of `arandano/`**

```bash
cd ..
gh repo clone nmunozsi/arandano-worker
cd arandano-worker
```

- [x] **Step 3: Add the same OSS files as Task 1** (LICENSE may already exist from `--license MIT` — keep it; otherwise paste the MIT template).

Adapt `README.md` for the worker:

```markdown
# arandano-worker

> OCI image that runs a single arandano task in isolation.

This image bundles [sandcastle](https://github.com/mattpocock/sandcastle), [superpowers](https://github.com/obra/superpowers), and a small Node helper that enforces TDD and quality gates before opening a PR. It's launched by the [arandano](https://github.com/nmunozsi/arandano) CLI; you probably don't run it directly.

## Status

Pre-alpha. See the [arandano design doc](https://github.com/nmunozsi/arandano/blob/main/arandano-design.md) §15 for the worker's preflight contract.

## License

MIT.
```

`CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` mirror Task 1 with worker-flavored wording.

- [x] **Step 4: Create `Dockerfile` (multi-stage skeleton)**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /worker

FROM base AS deps
COPY lib/package.json lib/package-lock.json* ./lib/
RUN cd lib && npm ci

FROM base AS build
COPY --from=deps /worker/lib/node_modules ./lib/node_modules
COPY lib ./lib
RUN cd lib && npm run build

FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq \
 && rm -rf /var/lib/apt/lists/*

# Phase 1 installs sandcastle CLI, claude-code, and the superpowers plugin here.
COPY --from=build /worker/lib/dist ./lib/dist
COPY --from=build /worker/lib/node_modules ./lib/node_modules
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
```

- [x] **Step 5: Create `entrypoint.sh` placeholder**

```sh
#!/usr/bin/env sh
set -eu

echo "arandano-worker: placeholder entrypoint (Phase 0)"
echo "  ARANDANO_TASK_ID=${ARANDANO_TASK_ID:-<unset>}"
echo "  workdir=$(pwd)"

# Phase 1 will replace this with the real task driver.
exit 0
```

- [x] **Step 6: Create `lib/` Node helper skeleton**

`lib/package.json`:

```json
{
  "name": "@arandano-worker/lib",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "private": true,
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --target node22 --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "tsup": "^8.2.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

`lib/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

`lib/src/index.ts`:

```ts
export const WORKER_VERSION = '0.0.0';
```

`lib/src/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WORKER_VERSION } from '../index.js';

describe('arandano-worker lib', () => {
  it('exports a version string', () => {
    expect(WORKER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [x] **Step 7: Install and verify**

```bash
cd lib && npm install && npm run build && npm test && cd ..
docker build -t arandano-worker:dev .
```

Expected: build succeeds; running it prints the placeholder message:

```bash
docker run --rm arandano-worker:dev
```

- [x] **Step 8: Add CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: cd lib && npm install && npm test && npm run build
      - uses: docker/setup-buildx-action@v3
      - run: docker build -t arandano-worker:ci .
      - run: docker run --rm arandano-worker:ci
```

- [x] **Step 9: Commit and push**

```bash
git add .
git commit -m "chore: bootstrap arandano-worker repo with Dockerfile skeleton and lib/ helper"
git push -u origin main
```

Watch CI:

```bash
gh run watch --exit-status
```

Expected: green.

---

### Task 12: Bootstrap `arandano-examples` repo

**Goal:** A third GitHub repo exists with OSS scaffolding and a placeholder README listing the examples that will land in Phase 1.

- [x] **Step 1: Create the repo on GitHub**

```bash
gh repo create nmunozsi/arandano-examples \
  --public \
  --license MIT \
  --description "Sample projects scaffolded by arandano init (Node-TS, Python, static site)"
```

- [x] **Step 2: Clone it as a sibling**

```bash
cd ..
gh repo clone nmunozsi/arandano-examples
cd arandano-examples
```

- [x] **Step 3: Add OSS files** (LICENSE if not already present, README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, .gitignore)

`README.md`:

```markdown
# arandano-examples

> Sample projects scaffolded by [arandano](https://github.com/nmunozsi/arandano) `init`.

## Planned (Phase 1)

| Folder             | Stack    | Description                                                       |
| ------------------ | -------- | ----------------------------------------------------------------- |
| `node-ts-toy/`     | node-ts  | Tiny Node + TypeScript service used in arandano's end-to-end test |
| `python-cli-toy/`  | python   | Tiny Python CLI used in arandano's end-to-end test (Phase 2)      |
| `static-site-toy/` | polyglot | Static site demonstrating polyglot stack (Phase 2)                |

Currently empty — these are filled in by Phase 1 of the arandano implementation plan.

## License

MIT.
```

`.gitignore`:

```gitignore
node_modules/
dist/
.venv/
__pycache__/
.DS_Store
.env
```

- [x] **Step 4: Commit and push**

```bash
git add .
git commit -m "chore: bootstrap arandano-examples repo with OSS scaffolding"
git push -u origin main
```

Expected: push succeeds; repo is visible on github.com.

---

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
