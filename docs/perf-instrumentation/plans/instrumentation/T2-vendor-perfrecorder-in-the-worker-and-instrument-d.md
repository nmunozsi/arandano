> **Location:** `docs/perf-instrumentation/plans/instrumentation/T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md`
>
> **Folder structure:**
>
> ```
> instrumentation/
> ├── plan.md
> ├── T1-perfrecorder-utility-in-arandano-core.md
> ├── T2-vendor-perfrecorder-in-the-worker-and-instrument-d.md          ← you are here
> ├── T3-instrument-dockerexecutor-and-add-csv-merger.md
> ├── T4-arandano-bench-cli-command.md
> ├── T5-baseline-measurement.md
> ├── T6-re-brainstorm-based-on-baseline-data.md
> ├── T7-improvement-a-npm-cache-volume.md
> ├── T8-improvement-b-skip-docker-pull-when-local-digest-m.md
> ├── T9-improvement-c-pre-bake-gate-tools-in-worker-image.md
> └── T10-summary-report.md
> ```

## Task 2: Vendor `PerfRecorder` in the worker and instrument `driver.ts`

**Goal:** Worker side captures `checkout`, `install`, `cli`, each `gate.<name>`, `push`, and `pr_create`, then writes `timings.json` into the run folder. Vendored because the worker is a separate repo with no `@arandano/core` dependency.

**Files (in `arandano-worker/lib/`):**

- Create: `src/perf.ts` (verbatim copy of the file from Task 1, no unused exports trimmed — minor duplication is acceptable here)
- Modify: `src/driver.ts`

- [ ] **Step 1: Copy the perf utility into the worker repo**

Create `arandano-worker/lib/src/perf.ts` with the **same** contents as `packages/core/src/perf.ts` (PerfRecorder + readTimingsJson + the two interfaces). Do not alter imports — both files use only `node:fs/promises` and `node:path`.

- [ ] **Step 2: Add imports and the recorder at the top of `driver.ts`**

In `arandano-worker/lib/src/driver.ts`, after the existing imports add:

```ts
import { PerfRecorder } from './perf.js';
```

Inside `main()` (after `const workspace = process.cwd();`), add:

```ts
const perf = new PerfRecorder();
```

- [ ] **Step 3: Wrap the `git checkout main` + branch-creation phase**

Replace:

```ts
await git(['checkout', defaultBranch], workspace).catch(() => {});
```

with:

```ts
const stopCheckout = perf.start('checkout');
await git(['checkout', defaultBranch], workspace).catch(() => {});
```

And replace:

```ts
await createBranch(workspace, branch, baseBranch);
log(`branch: ${branch} (base ${baseBranch})`);
```

with:

```ts
await createBranch(workspace, branch, baseBranch);
log(`branch: ${branch} (base ${baseBranch})`);
stopCheckout();
```

- [ ] **Step 4: Wrap the install phase**

Replace:

```ts
const install = await(
  stack === 'python'
    ? runShell({ cmd: 'pip', args: ['install', '-r', 'requirements.txt'], cwd: workspace })
    : stack === 'go'
      ? runShell({ cmd: 'go', args: ['mod', 'download'], cwd: workspace })
      : runShell({ cmd: 'npm', args: ['install'], cwd: workspace }),
);
log(`install exit=${install.exitCode}`);
```

with:

```ts
const stopInstall = perf.start('install');
const install = await(
  stack === 'python'
    ? runShell({ cmd: 'pip', args: ['install', '-r', 'requirements.txt'], cwd: workspace })
    : stack === 'go'
      ? runShell({ cmd: 'go', args: ['mod', 'download'], cwd: workspace })
      : runShell({ cmd: 'npm', args: ['install'], cwd: workspace }),
);
stopInstall();
log(`install exit=${install.exitCode}`);
```

- [ ] **Step 5: Wrap the CLI invocation**

Replace:

```ts
const cliRun = await invokeCli({
  cli,
  args: ['--print', '--dangerously-skip-permissions', '--model', model],
  prompt,
  cwd: workspace,
  env: process.env,
});
log(`cli exit=${cliRun.exitCode}`);
```

with:

```ts
const stopCli = perf.start('cli');
const cliRun = await invokeCli({
  cli,
  args: ['--print', '--dangerously-skip-permissions', '--model', model],
  prompt,
  cwd: workspace,
  env: process.env,
});
stopCli();
log(`cli exit=${cliRun.exitCode}`);
```

- [ ] **Step 6: Wrap each quality gate individually inside `runGates`'s `gates` map**

In the `gates:` object passed to `runGates`, wrap each `run` function so it records its own phase. Replace the existing object with:

```ts
gates: {
  format: {
    mode: quality.format,
    run: async () => {
      const stop = perf.start('gate.format');
      try { return await stackGates.formatGate(workspace); } finally { stop(); }
    },
  },
  lint: {
    mode: quality.lint,
    run: async () => {
      const stop = perf.start('gate.lint');
      try { return await stackGates.lintGate(workspace); } finally { stop(); }
    },
  },
  typecheck: {
    mode: quality.typecheck,
    run: async () => {
      const stop = perf.start('gate.typecheck');
      try { return await stackGates.typecheckGate(workspace); } finally { stop(); }
    },
  },
  test: {
    mode: quality.test,
    run: async () => {
      const stop = perf.start('gate.test');
      try { return await stackGates.testGate(workspace); } finally { stop(); }
    },
  },
  coverage: {
    mode: 'warn',
    run: async () => {
      const stop = perf.start('gate.coverage');
      try { return await stackGates.coverageGate(workspace); } finally { stop(); }
    },
  },
  security: {
    mode: quality.security,
    run: async () => {
      const stop = perf.start('gate.security');
      try { return await stackGates.securityGate(workspace); } finally { stop(); }
    },
  },
  commitMsg: {
    mode: quality.commit_msg === 'skip' ? 'skip' : 'required',
    run: async () => {
      const stop = perf.start('gate.commitMsg');
      try { return await commitMsgGate(workspace, baseBranch); } finally { stop(); }
    },
  },
},
```

- [ ] **Step 7: Wrap `openPr` (push + PR create) — split into two phases**

`openPr` does both `git push` and `gh pr create`. Splitting requires editing `openPr.ts`, but for now treat both as one `push_and_pr` phase (the host-side `wait` already gives the full container time; this captures just the openPr portion). Replace:

```ts
const pr = await openPr({
  cwd: workspace,
  baseBranch,
  branch,
  title: `[${task.id}] ${task.title}`,
  bodyPath,
});
```

with:

```ts
const stopPush = perf.start('push_and_pr');
const pr = await openPr({
  cwd: workspace,
  baseBranch,
  branch,
  title: `[${task.id}] ${task.title}`,
  bodyPath,
});
stopPush();
```

- [ ] **Step 8: Write `timings.json` at the end of `main()`**

In `main()`, just before the final `return pr.passed ? 0 : 1;`, add:

```ts
await perf.writeTimingsJson(join(workspace, '.arandano', 'runs', runFolder, 'timings.json'), {
  taskId,
  side: 'worker',
  stack,
});
```

Also write timings on the `fail()` path. In the `fail()` function (same file), at the top of the function body (immediately inside, before `writeResult`) add a TODO-free recorder pass-through: extend the `fail` signature:

```ts
async function fail(opts: {
  workspace: string;
  runFolder: string;
  taskId: string;
  branch: string;
  journal: string[];
  startedAt: string;
  reason: string;
  gates?: Awaited<ReturnType<typeof runGates>>;
  perf?: PerfRecorder;
  stack?: string;
}): Promise<number> {
  if (opts.perf) {
    await opts.perf.writeTimingsJson(
      join(opts.workspace, '.arandano', 'runs', opts.runFolder, 'timings.json'),
      { taskId: opts.taskId, side: 'worker', stack: opts.stack },
    );
  }
  // ... existing body ...
}
```

And at every existing `return await fail({...})` call inside `main()`, add `perf, stack` to the args object, e.g.:

```ts
return await fail({
  workspace,
  runFolder,
  taskId,
  branch,
  journal,
  startedAt,
  reason: 'install_failure',
  perf,
  stack,
});
```

Same for the `cli_failure`, `tdd_violation`, and `quality_violation` calls.

- [ ] **Step 9: Build the worker**

```bash
cd ../arandano-worker/lib
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 10: Commit and push the worker**

```bash
git add lib/src/perf.ts lib/src/driver.ts
git commit -m "feat(worker): instrument every phase and write timings.json"
git push origin main
```

This triggers `release.yml` to rebuild `ghcr.io/nmunozsi/arandano-worker:latest`.

- [ ] **Step 11: Wait for the image rebuild and pull it locally**

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1
# wait until the most recent run shows "success"
docker pull ghcr.io/nmunozsi/arandano-worker:latest
```

---
