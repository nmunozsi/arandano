> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T8-arandano-run-command.md`
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
> ├── T8-arandano-run-command.md                                         ← you are here
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 8: `arandano run` command

**Goal:** `arandano run <task-id>` invokes `runOne` against the local Docker executor.

**Files:**

- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/__tests__/run.test.ts`

- [x] **Step 1: Write the failing test**

`packages/cli/src/__tests__/run.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@arandano/core', async (orig) => {
  const real = await orig<typeof import('@arandano/core')>();
  return {
    ...real,
    runOne: vi.fn(async () => ({ exitCode: 0, reason: 'ok' })),
  };
});

import Run from '../commands/run.js';
import { runOne } from '@arandano/core';

describe('arandano run', () => {
  it('calls runOne with the task id', async () => {
    await Run.run(['T1']);
    expect(runOne).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'T1' }));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npm test -- run.test
```

- [x] **Step 3: Implement `packages/cli/src/commands/run.ts`**

```ts
import { Args, Command } from '@oclif/core';
import { runOne } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';

export default class Run extends Command {
  static override description = 'Dispatch a task to a local Docker worker.';

  static override args = {
    taskId: Args.string({ required: true, description: 'task id (e.g. T1)' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Run);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(
      await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'),
    ) as { executor: { docker: { image: string } } };

    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });
    const result = await runOne({ projectRoot, taskId: args.taskId, executor });
    this.log(`exit=${result.exitCode} reason=${result.reason}`);
    if (result.exitCode !== 0) this.exit(result.exitCode);
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npm test -- run.test
```

- [x] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add arandano run <task-id> command"
```

---
