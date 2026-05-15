> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T5-wire-orchestrator.md`

---

id: T5
title: Wire architect synthesis into Orchestrator
role: coder
tdd: strict
depends_on: [T4]

---

# T5 — Orchestrator picks up the architect task at end-of-plan

**Files:**

- Modify: `packages/core/src/orchestrator/orchestrator.ts`
- Modify: `packages/core/src/orchestrator/__tests__/orchestrator.test.ts`

**Why:** This is the integration step. The Orchestrator already knows how to expand the reviewer task when a coder task completes; this task teaches it to append a single architect task once before the run starts (so the DAG knows about it from the beginning).

---

- [ ] **Step 1: Write a failing test**

Read `packages/core/src/orchestrator/__tests__/orchestrator.test.ts`. Locate the existing test that runs through the orchestrator with a stub executor. Add a new test in the same file:

```ts
import { synthesizeArchitectTask } from '../../architect/synthesizeArchitectTask.js';

it('appends T-architect when running a full plan with enabled=true', async () => {
  // Reuse the test helpers in this file to construct a tmp project with two coder tasks
  // and a config that includes roles.architect.enabled=true. Use a stub executor
  // that succeeds without doing anything.
  // … (mirror the shape of the existing successful-run test)

  const summary = await new Orchestrator({
    projectRoot,
    planSlug,
    executor: stubExecutor,
    withArchitect: false,
    noArchitect: false,
  }).run();

  expect(summary.completed).toContain('T-architect');
});

it('skips T-architect when --no-architect is passed', async () => {
  const summary = await new Orchestrator({
    projectRoot,
    planSlug,
    executor: stubExecutor,
    withArchitect: false,
    noArchitect: true,
  }).run();
  expect(summary.completed).not.toContain('T-architect');
});
```

> Reuse whatever fixture pattern the existing orchestrator tests use. Don't invent a new one.

- [ ] **Step 2: Run the test — should fail (Orchestrator doesn't take flags yet)**

```bash
npm test --workspace=@arandano/core -- -t Orchestrator
```

Expected: FAIL (`withArchitect`/`noArchitect` not in `OrchestratorOpts`).

- [ ] **Step 3: Extend `OrchestratorOpts`**

Edit `packages/core/src/orchestrator/orchestrator.ts`:

```diff
 export interface OrchestratorOpts {
   projectRoot: string;
   planSlug: string;
   executor: Executor;
   specName?: string;
   phaseSlug?: string;
+  withArchitect?: boolean;
+  noArchitect?: boolean;
 }
```

- [ ] **Step 4: Append T-architect to the DAG at startup**

In the `run()` method, after computing the filtered `tasks` and before `validateDag(fms)`:

```diff
+    // Synthesize architect task (mutates fms) before DAG validation so dependencies are checked together.
+    const runShape: RunShape = this.opts.phaseSlug
+      ? 'phase'
+      : (await loadPlan({ projectRoot, planSlug, ...(this.opts.specName !== undefined && { specName: this.opts.specName }) })).length === 1 && this.opts.phaseSlug === undefined
+        ? 'plan' // we always treat plan runs as 'plan' even if single-task by accident
+        : 'plan';
+    const architectTask = synthesizeArchitectTask({
+      tasks: fms,
+      planSlug,
+      enabledInConfig: cfg.roles.architect?.enabled === true,
+      withArchitect: this.opts.withArchitect === true,
+      noArchitect: this.opts.noArchitect === true,
+      runShape,
+    });
+    if (architectTask) {
+      fms.push(architectTask);
+      // Write a synthetic task MD next to the plan file so the worker can read it.
+      const planRoot = dirname(tasks[0]?.filePath ?? join(projectRoot, '.arandano'));
+      const archPath = join(planRoot, 'T-architect-auto.md');
+      const depsLine =
+        architectTask.depends_on && architectTask.depends_on.length > 0
+          ? `depends_on: [${architectTask.depends_on.join(', ')}]\n`
+          : '';
+      await writeFile(
+        archPath,
+        `---\nid: T-architect\ntitle: "${architectTask.title.replace(/"/g, '\\"')}"\nrole: architect\n${depsLine}---\nRefresh docs/architecture.md after plan ${planSlug}. Read /opt/arandano/skills/architect/SKILL.md.\n`,
+      );
+      taskFilePaths.set('T-architect', archPath);
+    }
     validateDag(fms);
```

Add the import at the top of the file:

```diff
 import { synthesizeReviewerTask } from '../reviewer/synthesizeReviewerTask.js';
+import { synthesizeArchitectTask, type RunShape } from '../architect/synthesizeArchitectTask.js';
```

> **Simplification:** `runShape` is `'phase'` when `phaseSlug` is set, otherwise `'plan'`. The `'single'` shape is detected at the CLI layer (the CLI doesn't construct an `Orchestrator` for single-task runs — it calls `runOne` directly). So inside the Orchestrator we only need:
>
> ```ts
> const runShape: RunShape = this.opts.phaseSlug ? 'phase' : 'plan';
> ```
>
> Replace the complicated block above with that one line.

- [ ] **Step 5: Re-run tests**

```bash
npm test --workspace=@arandano/core -- -t Orchestrator
```

Expected: PASS for both new tests.

- [ ] **Step 6: Run the full core test suite**

```bash
npm test --workspace=@arandano/core
```

Expected: PASS (the reviewer + DAG tests still pass).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/orchestrator/orchestrator.ts \
        packages/core/src/orchestrator/__tests__/orchestrator.test.ts
git commit -m ":sparkles: feat(core): auto-spawn T-architect at end of plan runs"
```

## Acceptance

- `Orchestrator` accepts `withArchitect?: boolean` and `noArchitect?: boolean`
- A full-plan run with `enabled=true` includes `T-architect` in `summary.completed`
- A run with `noArchitect: true` does not include `T-architect`
- A run with `phaseSlug` set does not include `T-architect` unless `withArchitect: true`
- Existing tests still pass
