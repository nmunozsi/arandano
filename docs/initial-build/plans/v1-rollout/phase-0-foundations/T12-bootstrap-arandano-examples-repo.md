> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T12-bootstrap-arandano-examples-repo.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
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
> └── T12-bootstrap-arandano-examples-repo.md                           ← you are here
> ```

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
