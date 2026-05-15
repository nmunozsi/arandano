> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T4-ci-workflow.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md                                                 ← you are here
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

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
