> **Location:** `docs/perf-instrumentation/plans/instrumentation/T9-improvement-c-pre-bake-gate-tools-in-worker-image.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md
> ├── T4-arandano-bench-cli-command.md
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md           ← you are here
> └── T10-summary-report.md
> ```

## Task 9: Improvement C — pre-bake gate tools in worker image (tentative)

**Note:** Conditional on T6's decision. The biggest implementation risk of this plan; if T6 dropped C, skip entirely.

**Goal:** Install `vitest`, `eslint`, `prettier`, `typescript`, and `typescript-eslint` globally in the worker image so `npm install` for typical projects has nothing to fetch.

**Files (in `arandano-worker/`):**

- Modify: `lib/Dockerfile` (add a global-install layer)
- Modify: `arandano-worker/lib/src/driver.ts` (PATH plumbing if needed)

- [ ] **Step 1: Edit `arandano-worker/lib/Dockerfile`**

Add a global-install stage just before the `USER worker` line:

```dockerfile
RUN npm install -g --omit=dev \
    vitest@^3 \
    eslint@^9 \
    prettier@^3 \
    typescript@^5 \
    typescript-eslint@^8 \
    @vitest/coverage-v8@^3 \
    @types/node@^22
```

These are the tools that the node-ts scaffold's `package.json` declares; pre-baking them lets `npm install` short-circuit when local `node_modules` already covers everything.

Note: this couples the worker image to a minimum version of each tool. User projects with a higher constraint will still trigger `npm install` to upgrade. The intent is to cover the common-case `node-ts` toy.

- [ ] **Step 2: (Optional, if needed) make global tools visible to project `npm install`**

If `npm install` still re-downloads everything despite the global presence (because npm doesn't search global by default for project deps), add a `prefer-offline` config to the worker entrypoint:

```dockerfile
ENV NPM_CONFIG_PREFER_OFFLINE=true
```

This will use the npm cache (already mounted as a volume from Task 7) when present, falling back to the registry only when packages are missing.

- [ ] **Step 3: Build the worker locally to sanity-check**

```bash
cd ../arandano-worker
docker build -t arandano-worker:phase3-prebake -f lib/Dockerfile lib/
```

Expected: build completes without errors. The image will be larger by ~200 MB.

- [ ] **Step 4: Commit and push**

```bash
git add lib/Dockerfile
git commit -m "perf(worker): pre-bake gate tools globally to short-circuit npm install"
git push origin main
```

Wait for the `release.yml` workflow to publish the new `:latest` image:

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
```

- [ ] **Step 5: Re-measure**

Reset toy state, pull the new image, then run the plan:

```powershell
docker pull ghcr.io/nmunozsi/arandano-worker:latest
node ".../arandano/packages/cli/dist/bin.js" run --plan=2026-05-11-three-helpers
node ".../arandano/packages/cli/dist/bin.js" bench --last 9
```

- [ ] **Step 6: Record the delta** in the Results table.

---
