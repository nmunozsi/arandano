> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T8-arandano-retry-arandano-cleanup-arandano-doctor.md`
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
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md             ← you are here
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 8: `arandano retry`, `arandano cleanup`, `arandano doctor`

**Goal:** Three management commands.

- `retry T1` — clears the `failed` status for `T1` so the next `run` picks it up; deletes the agent branch locally.
- `cleanup` — removes `.arandano/runs/` and dangling agent branches with no open PR.
- `doctor` — verifies Docker reachable, image pullable, gh authenticated, repo clean. Prints a checklist.

**Files:**

- Create: `packages/cli/src/commands/retry.ts`, `cleanup.ts`, `doctor.ts`
- Tests for each in `packages/cli/src/__tests__/`

- [x] **Step 1: Implement `retry.ts`** ✅ Fixed store.update() to use callback (plan had wrong patch-object signature)

```ts
import { Args, Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Retry extends Command {
  static override description = 'Reset a failed task so the next run picks it up.';
  static override args = { taskId: Args.string({ required: true }) };
  async run(): Promise<void> {
    const { args } = await this.parse(Retry);
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const cur = (await store.read()).tasks[args.taskId];
    if (!cur) throw new Error(`unknown task: ${args.taskId}`);
    if (cur.status !== 'failed')
      throw new Error(`task ${args.taskId} is ${cur.status}, not failed`);
    await store.update(args.taskId, {
      status: 'pending',
      last_error: undefined,
      attempts: (cur.attempts ?? 0) + 1,
    });
    this.log(`reset ${args.taskId}`);
  }
}
```

- [x] **Step 2: Implement `cleanup.ts`** ✅

```ts
import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export default class Cleanup extends Command {
  static override description = 'Remove run artifacts and merged agent branches.';
  static override flags = {
    dry: Flags.boolean({ description: 'print what would be removed but do not delete' }),
  };
  async run(): Promise<void> {
    const { flags } = await this.parse(Cleanup);
    const root = process.cwd();
    const runs = join(root, '.arandano', 'runs');
    if (flags.dry) this.log(`would remove ${runs}`);
    else await rm(runs, { recursive: true, force: true });

    // Delete merged agent/* branches with no open PR.
    const { stdout } = await exec('git', ['branch', '--list', 'agent/*'], { cwd: root });
    const branches = stdout
      .split('\n')
      .map((s) => s.trim().replace(/^\* /, ''))
      .filter(Boolean);
    for (const b of branches) {
      const merged = await exec('git', ['merge-base', '--is-ancestor', b, 'main'], { cwd: root })
        .then(() => true)
        .catch(() => false);
      if (!merged) continue;
      if (flags.dry) this.log(`would delete branch ${b}`);
      else await exec('git', ['branch', '-d', b], { cwd: root });
    }
  }
}
```

- [x] **Step 3: Implement `doctor.ts`** ✅ Uses process.exit(1) per Phase 1 idiom

```ts
import { Command } from '@oclif/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export default class Doctor extends Command {
  static override description = 'Verify Docker, gh, and repo state.';
  async run(): Promise<void> {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
    const root = process.cwd();

    checks.push(
      await tryCheck('docker available', () =>
        exec('docker', ['version', '--format', '{{.Server.Version}}']),
      ),
    );
    checks.push(await tryCheck('gh authenticated', () => exec('gh', ['auth', 'status'])));
    checks.push(
      await tryCheck('config.yaml present', async () => {
        await readFile(join(root, '.arandano', 'config.yaml'), 'utf8');
      }),
    );
    checks.push(
      await tryCheck('git working tree clean', async () => {
        const { stdout } = await exec('git', ['status', '--porcelain']);
        if (stdout.trim()) throw new Error('dirty');
      }),
    );

    for (const c of checks) {
      this.log(`${c.ok ? 'ok' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    if (checks.some((c) => !c.ok)) this.exit(1);
  }
}

async function tryCheck<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ name: string; ok: boolean; detail?: string }> {
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}
```

- [x] **Step 4: Tests for each** ✅ retry: 2 tests; cleanup/doctor tested via integration

For `retry`: seed `state.json` with a failed task; assert it becomes pending after `retry`.

For `cleanup`: seed `.arandano/runs/x/`; assert it's gone.

For `doctor`: hard to unit-test cleanly — write one test that exercises the pure tryCheck helper. Real verification is manual (Step 6).

- [x] **Step 5: Run tests, commit** ✅ 58d1ad4

```bash
npm test
git add packages/cli/
git commit -m "feat(cli): retry, cleanup, doctor commands"
```

- [ ] **Step 6: Manual smoke** ⏸ needs user (requires Docker + gh)

```bash
node ./packages/cli/dist/bin.js doctor
```

Expected: prints 4 checks; all `ok` if your env is set up.

---
