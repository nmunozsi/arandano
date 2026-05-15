> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T12-end-to-end-batched-run-on-the-node-ts-toy.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md                  ← you are here
> ```

### Task 12: End-to-end batched run on the node-ts toy

**Goal:** Author a 3-task plan in the toy repo, run with `arandano run --plan=<slug>`, watch all three PRs open in parallel (capped at `max_parallel`).

- [x] **Step 1: In the node-ts-toy, raise `max_parallel: 3` in `config.yaml`**

- [x] **Step 2: Write three small tasks** (`2026-05-11-three-helpers/T1-T3`)

- [x] **Step 3: Run** ✅ T5 and T6 completed (T4 already done); PRs #2 (T5), #3 (T4), #4 (T6) opened

  **Bugs found and fixed during first attempt (2026-05-14):**

  - **git HEAD race** — two containers shared the same bind-mounted `.git/HEAD`. T5 created its branch first (changing HEAD); T4 then read the wrong base and committed to T5's branch instead. Fix 1: `driver.ts` now uses `defaultBranch` directly instead of `currentBranch()` (`ff59fe2`). Fix 2: `DockerExecutor.start()` creates a `git clone --local` for each task so each container has its own isolated `.git` (`df37d0a`). `CloneProjectFn` is injectable for tests. Run artifacts are copied back to the main project after the container exits.
  - **stale remote branch (non-fast-forward push)** — previous failed run left `agent/T5-*` on remote with wrong history. Fix: `openPr.ts` uses `git push --force-with-lease`; also treats `gh pr create` "already exists" as success (`8b89e62`).

- [x] **Step 4: Verify with `arandano status`** ✅ T1/T4/T5/T6 all `completed`

- [x] **Step 5: Document in examples README**

```markdown
## Multi-task plan example

`.arandano/tasks/2026-05-08-three-helpers/` — three tasks ([T1](.../pull/2), [T2](.../pull/3), [T3](.../pull/4)) demonstrating parallel dispatch and dependency wiring.
```

---
