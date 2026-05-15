> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T3-self-hosting-quality-gates.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md                                  ← you are here
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
