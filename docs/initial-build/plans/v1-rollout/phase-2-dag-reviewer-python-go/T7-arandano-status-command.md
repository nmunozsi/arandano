> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T7-arandano-status-command.md`
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
> ├── T7-arandano-status-command.md                                     ← you are here
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 7: `arandano status` command

**Goal:** Pretty-print the current `state.json` as a table: task ID, status, branch, PR URL, attempts.

**Files:**

- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/__tests__/status.test.ts`

- [x] **Step 1: Write the failing test** ✅ Used module mocking instead of process.chdir (vitest workers don't support chdir)

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Status from '../commands/status.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-status-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('arandano status', () => {
  it('prints task statuses from state.json', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'state.json'),
      JSON.stringify({ tasks: { T1: { status: 'completed', branch: 'agent/T1-x' } } }),
    );
    const logs: string[] = [];
    const orig = process.cwd();
    process.chdir(dir);
    const cmd = new Status([], {} as never);
    cmd.log = (m?: unknown) => logs.push(String(m));
    try {
      await cmd.run();
    } finally {
      process.chdir(orig);
    }
    const joined = logs.join('\n');
    expect(joined).toContain('T1');
    expect(joined).toContain('completed');
  });
});
```

- [x] **Step 2: Implement `status.ts`** ✅

```ts
import { Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Status extends Command {
  static override description = 'Show task status from .arandano/state.json';
  async run(): Promise<void> {
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const state = await store.read();
    const ids = Object.keys(state.tasks).sort();
    if (ids.length === 0) {
      this.log('no tasks tracked yet');
      return;
    }
    this.log('TASK    STATUS        BRANCH                                    PR');
    for (const id of ids) {
      const t = state.tasks[id];
      this.log(
        `${id.padEnd(7)} ${(t?.status ?? '?').padEnd(13)} ${(t?.branch ?? '').padEnd(40)}  ${t?.pr_url ?? ''}`,
      );
    }
  }
}
```

- [x] **Step 3: Run tests, commit** ✅ b727394 (2/2 pass)

```bash
npm test -- status
git add packages/cli/
git commit -m "feat(cli): arandano status command"
```

---
