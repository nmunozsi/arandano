> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T1-static-template-files-for-the-node-ts-stack.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md                  ← you are here
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

### Task 1: Static template files for the Node-TS stack

**Goal:** All scaffold files exist as raw assets in `packages/templates/stacks/node-ts/`. Files using project-specific values (`{{name}}`, `{{worker_image}}`, `{{contact_email}}`) get the `.tpl` suffix.

**Files:**

- Create: `packages/templates/stacks/node-ts/AGENTS.md.tpl`
- Create: `packages/templates/stacks/node-ts/README.md.tpl`
- Create: `packages/templates/stacks/node-ts/.editorconfig`
- Create: `packages/templates/stacks/node-ts/.gitignore.tpl`
- Create: `packages/templates/stacks/node-ts/.prettierrc.json`
- Create: `packages/templates/stacks/node-ts/eslint.config.js`
- Create: `packages/templates/stacks/node-ts/tsconfig.json`
- Create: `packages/templates/stacks/node-ts/vitest.config.ts`
- Create: `packages/templates/stacks/node-ts/.commitlintrc.cjs`
- Create: `packages/templates/stacks/node-ts/.gitleaks.toml`
- Create: `packages/templates/stacks/node-ts/.lintstagedrc.json`
- Create: `packages/templates/stacks/node-ts/.husky/pre-commit`
- Create: `packages/templates/stacks/node-ts/.husky/commit-msg`
- Create: `packages/templates/stacks/node-ts/.github/workflows/ci.yml`
- Create: `packages/templates/stacks/node-ts/.arandano/config.yaml.tpl`
- Create: `packages/templates/stacks/node-ts/.arandano/roles/{planner,coder,reviewer,tester}.md`
- Create: `packages/templates/stacks/node-ts/planning/CONTEXT.md`
- Create: `packages/templates/stacks/node-ts/planning/memory/coding-standards.md.tpl`
- Create: `packages/templates/stacks/node-ts/planning/{specs,plans,decisions,issues}/.gitkeep`
- Create: `packages/templates/stacks/node-ts/src/CONTEXT.md`
- Create: `packages/templates/stacks/node-ts/docs/CONTEXT.md`
- Create: `packages/templates/stacks/node-ts/ops/CONTEXT.md`

- [x] **Step 1: Create `AGENTS.md.tpl` (Layer 1 — routing + naming)**

```markdown
# {{name}}

> Project identity: <one sentence — fill in>

## Tech stack

- Node 22
- TypeScript 5.5
- Vitest

## Workspaces

| Workspace   | Purpose                            |
| ----------- | ---------------------------------- |
| `/planning` | Specs, plans, ADRs, memory, issues |
| `/src`      | Production code (TDD)              |
| `/docs`     | User-facing documentation          |
| `/ops`      | Deploy + runbooks                  |

## Routing table

| Task                     | Workspace  | Read                                            | Skills                                                                                                          |
| ------------------------ | ---------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Brainstorm / spec / plan | /planning  | CONTEXT.md                                      | superpowers:brainstorming, superpowers:writing-plans                                                            |
| Implement a task (TDD)   | /src       | CONTEXT.md, planning/memory/coding-standards.md | superpowers:test-driven-development, superpowers:verification-before-completion, arandano:running-quality-gates |
| Open PR                  | /src       | CONTEXT.md                                      | superpowers:requesting-code-review                                                                              |
| Debug                    | /src, /ops | CONTEXT.md                                      | superpowers:systematic-debugging                                                                                |

## Naming conventions

- Spec: `planning/specs/YYYY-MM-DD-<slug>-design.md`
- Plan: `planning/plans/YYYY-MM-DD-<slug>-plan.md`
- ADR: `planning/decisions/YYYY-MM-DD-<slug>.md`
- Issue: `planning/issues/YYYY-MM-DD-<slug>.md`
- Task: `.arandano/tasks/<plan-slug>/T<n>-<slug>.md`
- Branch: `agent/T<n>-<slug>`
- PR title: `[T<n>] <task title>`
- Test: colocated `*.test.ts`

This file is canonical. `CLAUDE.md` and `GEMINI.md` are mirrors.
```

- [x] **Step 2: Create `README.md.tpl`**

```markdown
# {{name}}

Scaffolded with [arandano](https://github.com/nmunozsi/arandano).

## Workflow

1. Brainstorm and write a plan in `planning/`.
2. Decompose the plan into task MDs in `.arandano/tasks/<plan-slug>/`.
3. Run a task with `arandano run <task-id>`.
4. Review the resulting PR.

## License

{{license}}
```

- [x] **Step 3: Create `.editorconfig`**

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

- [x] **Step 4: Create `.gitignore.tpl`**

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.npm/

# arandano
.arandano/state.json
.arandano/runs/

# OS / editor
.DS_Store
Thumbs.db
.vscode/
.idea/

# Env
.env
.env.local
.env.*.local
```

- [x] **Step 5: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [x] **Step 6: Create `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
```

- [x] **Step 7: Create `tsconfig.json`**

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
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [x] **Step 8: Create `vitest.config.ts`**

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

- [x] **Step 9: Create `.commitlintrc.cjs`, `.gitleaks.toml`, `.lintstagedrc.json`**

`.commitlintrc.cjs`:

```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

`.gitleaks.toml`:

```toml
title = "{{name}} gitleaks config"

[allowlist]
paths = ['''node_modules/''', '''dist/''', '''package-lock\.json''']
```

`.lintstagedrc.json`:

```json
{
  "*.{ts,tsx,js,cjs,mjs}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

- [x] **Step 10: Create `.husky/pre-commit` and `.husky/commit-msg`**

`.husky/pre-commit`:

```sh
npx lint-staged
```

`.husky/commit-msg`:

```sh
npx --no -- commitlint --edit "$1"
```

- [x] **Step 11: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
permissions: { contents: read }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx prettier --check .
      - run: npx eslint . --max-warnings=0
      - run: npx tsc --noEmit
      - run: npx vitest run --coverage
      - run: npm audit --audit-level=high
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

- [x] **Step 12: Create `.arandano/config.yaml.tpl`**

```yaml
project:
  name: { { name } }
  default_branch: main
  license: { { license } }
  stack: node-ts

executor:
  backend: docker
  docker:
    image: { { worker_image } }
    workdir: /workspace
    plugins_mount: baked-in
    env_pass:
      - GH_TOKEN
      - ANTHROPIC_API_KEY

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
  coverage: { min: 80, delta: any }
  security: warn
  commit_msg: conventional
  reviewer_required: false

batching:
  max_parallel: 1
  timeout_minutes: 45
  retry_policy:
    max_attempts: 1
    on: [container_error, network_error]
```

(Phase 1 ships `max_parallel: 1` and `reviewer_required: false`. Phase 2 raises both.)

- [x] **Step 13: Create role MDs**

`.arandano/roles/coder.md`:

```markdown
# Coder role

You implement one task at a time using strict TDD.

## Procedure

1. Read the task MD at `${ARANDANO_TASK_PATH}`.
2. Read `src/CONTEXT.md` and `planning/memory/coding-standards.md`.
3. Write a failing test for the smallest behavior the task requires. Commit it as `test: <…>`.
4. Write the minimum code to make the test pass. Commit as `feat: <…>` or `fix: <…>`.
5. Refactor if needed. Tests must still pass.
6. Run all quality gates (`arandano:running-quality-gates`).
7. Push the branch and let the worker open the PR.

## Rules

- Never push to `main`. Branch is `agent/T<n>-<slug>` (already created for you).
- One task = one PR.
- Conventional commits.
```

`.arandano/roles/planner.md`:

```markdown
# Planner role

You take a spec or rough idea and produce a written plan and a set of task MDs in `.arandano/tasks/`.
Use `superpowers:brainstorming` and `superpowers:writing-plans`. Save the plan to `planning/plans/YYYY-MM-DD-<slug>-plan.md`.
```

`.arandano/roles/reviewer.md`:

```markdown
# Reviewer role

You review a PR opened by the coder. (Phase 1: not auto-spawned. Phase 2 wires this up.)

Procedure:

1. `gh pr diff <number>`
2. Read `src/CONTEXT.md`, `planning/memory/coding-standards.md`, ADRs.
3. Apply the reviewer checklist (see `arandano-design.md` §15.3).
4. `gh pr review --request-changes` or `--approve`. Write `review.md` to the run folder.
```

`.arandano/roles/tester.md`:

```markdown
# Tester role

You add or strengthen tests for an existing module. Same TDD discipline as coder; no production code edits unless required to make tests run.
```

- [x] **Step 14: Create `planning/CONTEXT.md`, `src/CONTEXT.md`, `docs/CONTEXT.md`, `ops/CONTEXT.md`**

`planning/CONTEXT.md`:

```markdown
# planning/

This workspace is for thinking before code. Pipeline:

1. Brainstorm in `specs/YYYY-MM-DD-<slug>-design.md` (use `superpowers:brainstorming`).
2. Write a plan in `plans/YYYY-MM-DD-<slug>-plan.md` (use `superpowers:writing-plans`).
3. Decompose the plan into task MDs in `.arandano/tasks/<plan-slug>/`.

Memory lives in `memory/` (no dates — stable knowledge that evolves). Always read `memory/coding-standards.md` before writing code.

ADRs go in `decisions/`. Issues go in `issues/`.
```

`src/CONTEXT.md`:

```markdown
# src/

Production code workspace. **TDD is required:** red → green → refactor.

Always read `planning/memory/coding-standards.md` before editing.

Tests are colocated as `*.test.ts`. Run with `npx vitest`.

Quality gates run in this order before any PR is opened: format → lint → typecheck → test → coverage → security → commit message.
```

`docs/CONTEXT.md`:

```markdown
# docs/

User-facing documentation. Pipeline: outline → draft → review → publish.
```

`ops/CONTEXT.md`:

```markdown
# ops/

Deploy + runbooks. Pipeline: design → deploy → observe → runbook.
```

- [x] **Step 15: Create `planning/memory/coding-standards.md.tpl`**

```markdown
# {{name}} — coding standards

Stable rules that every coder + reviewer task reads. Append to this file when a recurring issue surfaces in review.

## Error handling

- Log at the boundary, never swallow.

## Naming

- camelCase for variables, PascalCase for types.

## Tests

- One behavior per test. Test names describe the behavior, not the function.

(Add more as the project matures.)
```

- [x] **Step 16: Add `.gitkeep` files in empty dirs**

Create empty files at:
`planning/specs/.gitkeep`, `planning/plans/.gitkeep`, `planning/decisions/.gitkeep`, `planning/issues/.gitkeep`.

- [x] **Step 17: Commit**

```bash
git add packages/templates/stacks/node-ts/
git commit -m "feat(templates): add node-ts stack scaffold assets"
```

---
