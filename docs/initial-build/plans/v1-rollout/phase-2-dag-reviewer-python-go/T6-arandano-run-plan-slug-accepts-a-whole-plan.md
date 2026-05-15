> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T6-arandano-run-plan-slug-accepts-a-whole-plan.md`
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
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md                 ← you are here
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 6: `arandano run --plan=<slug>` accepts a whole plan

**Goal:** Extend the existing `run` command so a single argument is still a task ID, but `--plan=<slug>` runs the entire plan via `Orchestrator`.

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/__tests__/run.test.ts`

- [x] **Step 1: Update tests** ✅

```ts
it('runs a whole plan when --plan is set', async () => {
  // Use a fake projectRoot via cwd; mock Orchestrator
});
```

- [x] **Step 2: Update `run.ts`** ✅

```ts
import { Args, Command, Flags } from '@oclif/core';
import { Orchestrator, runOne } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';

export default class Run extends Command {
  static override description = 'Run a single task or a whole plan.';
  static override args = {
    taskId: Args.string({ required: false, description: 'task id (omit when using --plan)' }),
  };
  static override flags = {
    plan: Flags.string({ description: 'plan slug under .arandano/tasks/<slug>/' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'));
    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });

    if (flags.plan) {
      const o = new Orchestrator({ projectRoot, planSlug: flags.plan, executor });
      const summary = await o.run();
      this.log(
        `completed=${summary.completed.length} failed=${summary.failed.length} skipped=${summary.skipped.length}`,
      );
      if (summary.failed.length > 0) this.exit(1);
      return;
    }

    if (!args.taskId) throw new Error('provide a task id or --plan');
    const result = await runOne({ projectRoot, taskId: args.taskId, executor });
    this.log(`exit=${result.exitCode} reason=${result.reason}`);
    if (result.exitCode !== 0) this.exit(result.exitCode);
  }
}
```

- [x] **Step 3: Run tests, commit** ✅ 6b66a66 (2/2 pass). Also exported Orchestrator/loadPlan/synthesizeReviewerTask from @arandano/core.

```bash
npm test -- run.test
git add packages/cli/
git commit -m "feat(cli): arandano run --plan dispatches the whole DAG"
```

---
