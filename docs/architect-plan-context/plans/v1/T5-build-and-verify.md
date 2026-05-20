> **Location:** `docs/architect-plan-context/plans/v1/T5-build-and-verify.md`

# T5 — Build worker and verify

**Repo:** `arandano-worker`

**Context:** T1–T4 made code changes in `packages/core` (arandano monorepo) and `arandano-worker`. T5 builds both, runs the full test suites, and pushes the worker to trigger a new image build. It also updates the plan checklist once all tasks are confirmed passing.

---

- [x] **Step 1: Build and test the arandano monorepo**

From the `arandano` monorepo root:

```
npm run build && npm test
```

Expected: all packages build and all tests pass (no regressions from T1 and T2).

- [x] **Step 2: Build the worker**

From `arandano-worker`:

```
cd lib && npm run build
```

Expected output: `tsup` compiles `src/index.ts`, `src/driver.ts`, `src/start.ts` into `dist/` with no TypeScript errors.

Build command (tsup invocation inside `lib/package.json#scripts.build`):

```
tsup src/index.ts src/driver.ts src/start.ts --format esm --dts --target node22 --clean
```

If this fails with a TypeScript error in `architectDriver.ts`, check that all imports used by `resolvePlanContext` and `buildArchitectPrompt` are present (`readFile` from `node:fs/promises`, `join` from `node:path`).

- [x] **Step 3: Run the worker test suite**

```
cd lib && npm test
```

Expected: all tests pass including the 11 new `architectDriver` tests from T3.

- [x] **Step 4: Push to trigger image rebuild**

From `arandano-worker` root (not `lib/`):

```
git push
```

Expected: push succeeds. Then watch the workflow:

```
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
```

Wait for `status: completed` and `conclusion: success`. This typically takes 3–5 minutes.

- [x] **Step 5: Verify the new image passes CI**

Once the `release.yml` workflow completes, the `ci.yml` workflow should also pass on that same push. Check:

```
gh run list --workflow=ci.yml --repo nmunozsi/arandano-worker --limit 1
```

Expected: `conclusion: success`.

If `ci.yml` fails, check the smoke test output:

```
gh run view --log --repo nmunozsi/arandano-worker $(gh run list --workflow=ci.yml --repo nmunozsi/arandano-worker --limit 1 --json databaseId --jq '.[0].databaseId')
```

- [x] **Step 6: Update the plan checklist**

In `docs/architect-plan-context/plans/v1/plan.md`, mark all five tasks complete:

```markdown
- [x] [T1 — runOne: back-propagate branch and pr_url from result.json to state.json](T1-runone-result-backprop.md)
- [x] [T2 — Orchestrator: write plan-context.json, inject context env vars, remove gitMergeRange](T2-orchestrator-plan-context.md)
- [x] [T3 — Architect driver: context priority chain, remove mergeRange](T3-architect-driver-context.md)
- [x] [T4 — SKILL.md: add lazy-fetch strategy sections, remove ARANDANO_PLAN_MERGE_RANGE reference](T4-skill-md-lazy-fetch.md)
- [x] [T5 — Build worker and verify](T5-build-and-verify.md)
```

- [x] **Step 7: Commit the plan update**

```
git add docs/architect-plan-context/plans/v1/plan.md
git commit -m ":memo: docs(plans): mark architect-plan-context v1 complete"
```
