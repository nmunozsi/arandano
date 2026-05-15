> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T12-worker-invoke-claude-code.md`
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
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md                                   ← you are here
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 12: Worker — invoke Claude Code (TDD against a fake CLI)

**Goal:** A function that spawns the configured CLI with the right prompt + env. Tested with a fake CLI binary that just echoes args.

**Files:**

- Create: `lib/src/invokeClaudeCode.ts`
- Create: `lib/src/__tests__/invokeClaudeCode.test.ts`

- [x] **Step 1: Write the failing test**

`lib/src/__tests__/invokeClaudeCode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeCli } from '../invokeClaudeCode.js';

describe('invokeCli', () => {
  it('passes the prompt and inherits env', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fake-cli-'));
    const fake = join(dir, 'fake-cli');
    await writeFile(
      fake,
      `#!/usr/bin/env node
const fs = require('fs');
const buf = fs.readFileSync(0, 'utf8');
process.stdout.write('PROMPT='+buf);
process.exit(0);
`,
    );
    await chmod(fake, 0o755);
    try {
      const r = await invokeCli({
        cli: fake,
        args: ['--print'],
        prompt: 'hello world',
        cwd: dir,
        env: { ...process.env, ARANDANO_TASK_ID: 'T1' },
      });
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain('PROMPT=hello world');
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
```

- [x] **Step 2: Implement `lib/src/invokeClaudeCode.ts`**

```ts
import { spawn } from 'node:child_process';

export async function invokeCli(opts: {
  cli: string;
  args: string[];
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(opts.cli, opts.args, { cwd: opts.cwd, env: opts.env });
    let buf = '';
    proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    proc.stderr.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    proc.stdin.end(opts.prompt);
    proc.on('close', (code) => resolve({ exitCode: code ?? 1, output: buf }));
  });
}
```

- [x] **Step 3: Run tests, commit**

```bash
npm test -- invokeClaudeCode
git add lib/
git commit -m "feat(lib): CLI invocation helper"
```

---
