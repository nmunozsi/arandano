> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T16-end-to-end-smoke-test-in-arandano-examples.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
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
> └── T16-end-to-end-smoke-test-in-arandano-examples.md                  ← you are here
> ```

### Task 16: End-to-end smoke test in `arandano-examples`

**Goal:** Apply `arandano init` to a folder in `arandano-examples`, write one task MD, run `arandano run T1`, and verify a PR is opened with all gates green.

**Files (in `arandano-examples`):**

- Create: `node-ts-toy/` (the entire `arandano init --stack=node-ts` output)
- Create: `node-ts-toy/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md`

- [x] **Step 1: From the `arandano` repo, run `init` against a fresh folder under examples**

```bash
cd ../arandano-examples
mkdir node-ts-toy && cd node-ts-toy
node ../../arandano/packages/cli/dist/bin.js init \
  --stack=node-ts --name=node-ts-toy \
  --worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0
```

- [x] **Step 2: Initialize git and an upstream**

```bash
git init -b main
gh repo create nmunozsi/arandano-examples-node-ts-toy --public --license MIT --source=. --remote=origin --push
```

(Or commit into a subfolder of `arandano-examples` and push that monorepo. Either works; subfolder is simpler.)

- [x] **Step 3: Add `package.json` for the toy app**

```bash
npm init -y
npm install -D vitest@1.6 typescript@5.5 @types/node prettier@3.3 eslint@9 typescript-eslint @commitlint/{cli,config-conventional} husky lint-staged
mkdir src
```

`src/greet.ts`:

```ts
export const greet = (name: string): string => `hello, ${name}`;
```

(no test yet — that's the worker's job)

- [x] **Step 4: Create the task MD**

`.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md`:

```markdown
---
id: T1
title: Add a greet helper with a test
role: coder
tdd: strict
tests:
  - 'src/greet.test.ts exists'
  - 'greet("world") === "hello, world"'
acceptance:
  - 'PR opened'
---

## Context

Add a small `greet` function in `src/greet.ts` that returns `"hello, <name>"`. There's already a stub — write a test first, make it pass, refactor, and commit.

## Files likely to change

- src/greet.ts
- src/greet.test.ts

## Done when

The `tests:` and `acceptance:` items are satisfied and the PR is opened with all required gates green.
```

- [x] **Step 5: Run the task**

```bash
export GH_TOKEN="$(gh auth token)"
export ANTHROPIC_API_KEY=...   # set your key
node ../../arandano/packages/cli/dist/bin.js run T1
```

Expected: container runs, the worker writes `src/greet.test.ts`, makes it pass, runs all gates, pushes `agent/T1-add-a-greet-helper-with-a-test`, and opens a PR.

- [x] **Step 6: Verify**

```bash
gh pr list
cat .arandano/runs/*/result.json
```

Expected: one PR open; `result.json` shows `passed: true` and every gate's `passed: true`.

- [x] **Step 7: Document the example**

Add to `arandano-examples/README.md`:

```markdown
## node-ts-toy

The toy used by Phase 1 end-to-end. The single task `T1-add-greet` produced [PR #1](https://github.com/.../pull/1) — fully agent-authored.
```

- [x] **Step 8: Commit in examples**

```bash
git add .
git commit -m "feat(node-ts-toy): seed scaffold and first arandano-authored PR"
git push
```

---
