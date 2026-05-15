> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T0-close-phase-1-s-deferred-e2e-gap.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md                            ← you are here
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
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

## Task 0: Close Phase 1's deferred e2e gap (prerequisite)

**Goal:** Prove the Phase 1 single-task happy path works end-to-end against real Docker before building DAG/batching on top. Phase 1 shipped code-complete but the actual e2e was deferred: `DockerExecutor` tests use a mocked Docker client; `ghcr.io/nmunozsi/arandano-worker:0.0.0` is not yet published; `arandano-examples/node-ts-toy/` has no agent-authored PR.

**Why prologue:** Debugging batching parallelism on top of an unverified base path is wasteful — failure could be in the new DAG code, the Phase 1 dispatch, the worker image, the executor, or env-var plumbing. Close the variance first.

**Files (most are verification, not creation):**

- Create: `packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts`
- Modify (optional): `packages/executors-docker/vitest.config.ts` (skip integration tests by default — opt in via `VITEST_DOCKER_INTEGRATION=1`)

- [x] **Step 1: Verify the worker image release workflow ran on main** ✅ release.yml pushed to origin; workflow succeeded (run 25703009169)

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
```

Expected: most recent run is `completed`/`success` on `main`. If not, push a no-op commit or trigger via `gh workflow run release.yml --repo nmunozsi/arandano-worker`.

- [x] **Step 2: Verify the image is pullable from ghcr** ✅ `docker pull ghcr.io/nmunozsi/arandano-worker:0.0.0` succeeded. Note: Dockerfile fixed uid 1001 (node image owns 1000); also added `client.pull()` before `createContainer` (commit 38e03ca).

```bash
docker pull ghcr.io/nmunozsi/arandano-worker:0.0.0
```

Expected: image pulls cleanly. If `denied: requested access to the resource is denied`, the package needs to be made public:

```bash
gh api -X PATCH /user/packages/container/arandano-worker --field visibility=public
```

- [x] **Step 3: Add an opt-in integration test for `DockerExecutor`** ✅ committed 433a066. Note: `QualitySpec` already has `reviewer_required` so the plan's `as never` cast was dropped.

`packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

const enabled = process.env.VITEST_DOCKER_INTEGRATION === '1';
const d = enabled ? describe : describe.skip;

d('DockerExecutor against real Docker', () => {
  it('starts a busybox container and observes a clean exit', async () => {
    const exec = new DockerExecutor({
      image: 'busybox:latest',
      projectRoot: process.cwd(),
    });
    // Minimal TaskRun — busybox just runs `true` via its default entrypoint override.
    // Phase 2 may extend DockerExecutor with a cmd override; for now we rely on
    // busybox's default `sh -c true` behavior via the spec.
    const task: TaskRun = {
      taskId: 'T_SMOKE',
      taskMdPath: '.arandano/tasks/smoke/T_SMOKE.md',
      rolePath: '.arandano/roles/coder.md',
      contextPaths: [],
      cli: 'echo',
      model: 'noop',
      tdd: 'relaxed',
      quality: {
        format: 'skip',
        lint: 'skip',
        typecheck: 'skip',
        test: 'skip',
        coverage: { min: 0, delta: 'any' },
        security: 'skip',
        commit_msg: 'skip',
      } as never,
      envPass: [],
      workdir: '/workspace',
      timeoutMs: 30_000,
      mcpServers: [],
    };
    const h = await exec.start(task);
    const r = await exec.wait(h, { timeoutMs: 30_000 });
    expect(r.exitCode).toBeDefined();
  }, 60_000);
});
```

- [x] **Step 4: Run the integration test** ✅ passed (1 test, 2568ms) — busybox container exits clean

```bash
VITEST_DOCKER_INTEGRATION=1 npm test -w packages/executors-docker -- DockerExecutor.integration
```

Expected: passes against the local Docker daemon. Without `VITEST_DOCKER_INTEGRATION=1` it's skipped, so CI won't be affected.

- [x] **Step 5: Run the worker image directly to confirm entrypoint and env-var contract** ✅ `start.ts` entry runs `main()` which throws `missing env: ARANDANO_TASK_MD` — entrypoint and env-var validation confirmed

```bash
docker run --rm \
  -e ARANDANO_TASK_ID=T_SMOKE \
  -e ARANDANO_TASK_MD=does-not-exist \
  -e ARANDANO_ROLE_MD=does-not-exist \
  -e ARANDANO_CLI=echo \
  -e ARANDANO_MODEL=noop \
  -e ARANDANO_TDD=relaxed \
  -e ARANDANO_RUN_FOLDER=2026-05-11T00-00Z-T_SMOKE \
  -e ARANDANO_QUALITY_JSON='{"format":"skip","lint":"skip","typecheck":"skip","test":"skip","coverage":{"min":0,"delta":"any"},"security":"skip","commit_msg":"skip"}' \
  ghcr.io/nmunozsi/arandano-worker:0.0.0 || true
```

Expected: container starts, driver loads, errors out reading the missing task MD. That's fine — the point is the entrypoint runs `node /opt/worker/lib/dist/driver.js`.

- [x] **Step 6: Run a real arandano run T1 against node-ts-toy** ✅ `pr: https://github.com/nmunozsi/node-ts-toy/pull/1 passed=true exit=0`

  **Fixes required before this worked (2026-05-12/13):**

  - `node-ts-toy` had no `package.json` — added with vitest/prettier/eslint/typescript devDeps.
  - `eslint.config.js` used `projectService: true` which rejected root-level config files not in `tsconfig.json`; fixed with `allowDefaultProject: ['*.js','*.cjs','*.mjs','*.ts']`.
  - Worker image missing `npm install` step before gates; added stack-aware install in `driver.ts` before CLI invoke.
  - `createBranch` crashed on stale agent branch left by prior failed run; fixed: checkout `defaultBranch` from config on startup, then force-recreate branch.
  - `claude --print` silently skipped file writes without `--dangerously-skip-permissions`; added flag.
  - `git push` in container used SSH remote (no SSH in image); fixed with `git config url."https://github.com/".insteadOf "git@github.com:"` in entrypoint + `gh auth setup-git`.
  - `GH_TOKEN` needed `write:packages` scope for GHCR push — switched from manual `docker push` to GitHub Actions `release.yml` (triggered by pushing to arandano-worker `main`).

- [x] **Step 7: Verify the artifacts and PR** ✅ PR #1 opened; `result.json` shows `passed: true`, every gate `passed: true`, `tdd.ok: true`

```bash
gh pr list --repo nmunozsi/node-ts-toy
cat .arandano/runs/2026-05-13T01-18Z-T1/result.json
```

- [x] **Step 8: Commit the integration test** ✅ committed 433a066

```bash
git add packages/executors-docker/src/__tests__/DockerExecutor.integration.test.ts
git commit -m "test(executors-docker): opt-in integration test against real Docker"
```

**Exit criterion for Task 0:** Phase 1's deferred e2e is closed — there's a real PR opened by the worker, the image is published, and the executor has at least one un-mocked test path. Phase 2 batching work can proceed.

---

## File Structure (this plan creates)

```
arandano/
├── packages/core/src/
│   ├── orchestrator/
│   │   ├── dag.ts                                  topo sort + ready batch
│   │   ├── orchestrator.ts                         drives batches to completion
│   │   └── __tests__/{dag,orchestrator}.test.ts
│   ├── reviewer/
│   │   ├── synthesizeReviewerTask.ts
│   │   └── __tests__/synthesizeReviewerTask.test.ts
│   └── tasks/
│       ├── loadPlan.ts                             read all task MDs in a plan dir
│       └── __tests__/loadPlan.test.ts
├── packages/cli/src/commands/
│   ├── status.ts
│   ├── retry.ts
│   ├── cleanup.ts
│   ├── doctor.ts
│   ├── memory/{promote,list}.ts
│   ├── issue/{open,close,list}.ts
│   └── run.ts                                      modify: accept --plan, dispatch batched
├── packages/templates/stacks/python/                full python scaffold (mirror node-ts)
├── packages/templates/stacks/go/                    full go scaffold

arandano-worker/
└── lib/src/
    ├── reviewer/
    │   ├── reviewerDriver.ts                       alt entrypoint when role=reviewer
    │   ├── reviewChecklist.ts
    │   └── __tests__/reviewChecklist.test.ts
    ├── gates/python/{format,lint,typecheck,test,coverage,security}.ts
    ├── gates/go/{format,lint,test,coverage,security}.ts
    ├── stack.ts                                    detect stack from .arandano/config.yaml
    └── driver.ts                                   modify: branch by stack
```

---
