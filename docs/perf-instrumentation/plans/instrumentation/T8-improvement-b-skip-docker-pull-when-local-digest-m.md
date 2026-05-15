> **Location:** `docs/perf-instrumentation/plans/instrumentation/T8-improvement-b-skip-docker-pull-when-local-digest-m.md`
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
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md          ← you are here
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 8: Improvement B — skip docker pull when local digest matches (tentative)

**Note:** Conditional on T6's decision. Adjust if B was dropped or modified.

**Goal:** Skip `docker pull` when the image's local digest matches the remote manifest's digest, falling through to a real pull otherwise.

**Files:**

- Modify: `packages/executors-docker/src/client.ts` (add a helper for fast digest check)
- Modify: `packages/executors-docker/src/DockerExecutor.ts` (use the helper before `pull`)

- [ ] **Step 1: Read the current client wrapper**

```bash
cat packages/executors-docker/src/client.ts
```

Note what `pull()` does today and the structure of `DockerClient`.

- [ ] **Step 2: Add an `imageDigest` helper that returns the local digest, or null**

In `packages/executors-docker/src/client.ts`, add a method on the `DockerClient` interface and implement it on the `defaultClient` factory:

```ts
export interface DockerClient {
  pull(image: string): Promise<void>;
  createContainer(spec: unknown): Promise<{
    /* existing fields */
  }>;
  imageDigest(image: string): Promise<string | null>;
}
```

In `defaultClient()`:

```ts
imageDigest: async (image: string) => {
  try {
    const inspect = await docker.getImage(image).inspect();
    const repoDigests: string[] = (inspect as { RepoDigests?: string[] }).RepoDigests ?? [];
    if (repoDigests.length === 0) return null;
    const match = repoDigests[0]!.split('@')[1];
    return match ?? null;
  } catch {
    return null;
  }
},
```

- [ ] **Step 3: Add a `--force-pull` flag to `run` and `bench` and a `forcePull` option to `DockerExecutor`**

In `packages/executors-docker/src/DockerExecutor.ts`, add to `DockerExecutorOpts`:

```ts
forcePull?: boolean;
```

In `start()`, change the pull block:

```ts
const stopPull = perf.start('pull');
if (this.opts.forcePull || !(await this.opts.client!.imageDigest(this.opts.image))) {
  await this.opts.client!.pull(this.opts.image);
}
stopPull();
```

Read: pull only when forced OR when no local image exists at all. The detailed manifest-comparison case can come later; this gives the dominant speedup with minimal complexity.

In `packages/cli/src/commands/run.ts`, add a `--force-pull` boolean flag and pass it through to `new DockerExecutor({ ..., forcePull: flags['force-pull'] })`.

- [ ] **Step 4: Update tests**

In `packages/executors-docker/src/__tests__/DockerExecutor.test.ts`, the fake `client` object needs an `imageDigest` stub. Add to each test's client mock:

```ts
imageDigest: vi.fn(() => Promise.resolve('sha256:abc')),
```

This makes the executor skip `pull` in tests — verify by asserting `client.pull` was **not** called in one test:

```ts
it('skips pull when local image digest is present', async () => {
  // ... build client with imageDigest returning 'sha256:abc' ...
  const exec = new DockerExecutor({
    /* ... */
  });
  await exec.start(task);
  expect(client.pull).not.toHaveBeenCalled();
});
```

Add a second test where `imageDigest` returns `null` and assert `client.pull` **was** called.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: green.

- [ ] **Step 6: Rebuild and re-measure**

```bash
npm run build
```

Reset state (keep T1, remove T4/T5/T6), then run the plan and compare:

```powershell
node ".../arandano/packages/cli/dist/bin.js" run --plan=2026-05-11-three-helpers
node ".../arandano/packages/cli/dist/bin.js" bench --last 6
```

- [ ] **Step 7: Record the delta** in the Results table.

- [ ] **Step 8: Commit**

```bash
git add packages/executors-docker/src/client.ts packages/executors-docker/src/DockerExecutor.ts packages/executors-docker/src/__tests__/DockerExecutor.test.ts packages/cli/src/commands/run.ts packages/cli/oclif.manifest.json docs/plans/2026-05-14-phase-3-performance.md
git commit -m "perf(executors-docker): skip docker pull when local image exists (-X% on cold start)"
```

---
