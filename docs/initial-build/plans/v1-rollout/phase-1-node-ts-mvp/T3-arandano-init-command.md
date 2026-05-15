> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T3-arandano-init-command.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md                                        ← you are here
> ├── T4-run-folder-layout-helpers.md
> ├── T5-container-spec-builder.md
> ├── T6-dockerexecutor-wiring.md
> ├── T7-single-task-orchestrator.md
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 3: `arandano init` command

**Goal:** `arandano init --stack=node-ts --name=my-app` runs `scaffold()` against the current working directory.

**Files:**

- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/__tests__/init.test.ts`

- [x] **Step 1: Write the failing test**

`packages/cli/src/__tests__/init.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Init from '../commands/init.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-init-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('arandano init', () => {
  it('scaffolds a node-ts project in the target dir', async () => {
    await Init.run([
      '--stack=node-ts',
      '--name=my-app',
      `--target=${dir}`,
      '--worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0',
    ]);
    expect((await stat(join(dir, 'AGENTS.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.arandano', 'config.yaml'))).isFile()).toBe(true);
  });

  it('rejects an unsupported stack', async () => {
    await expect(
      Init.run(['--stack=cobol', '--name=x', `--target=${dir}`, '--worker-image=x']),
    ).rejects.toThrow(/stack/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npm test -- init
```

Expected: fail (`init` command does not exist).

- [x] **Step 3: Implement `packages/cli/src/commands/init.ts`**

```ts
import { Command, Flags } from '@oclif/core';
import { isSupportedStack, scaffold } from '@arandano/templates';

export default class Init extends Command {
  static override description = 'Scaffold an arandano project in the current directory.';

  static override flags = {
    stack: Flags.string({ required: true, description: 'node-ts | python | go | polyglot' }),
    name: Flags.string({
      required: true,
      description: 'project name (interpolated into scaffold)',
    }),
    target: Flags.string({ description: 'target directory (defaults to cwd)' }),
    'worker-image': Flags.string({ required: true, description: 'arandano worker image' }),
    license: Flags.string({ default: 'MIT' }),
    'contact-email': Flags.string({ default: 'you@example.com' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    if (!isSupportedStack(flags.stack)) {
      throw new Error(`unsupported stack: ${flags.stack}`);
    }
    if (flags.stack !== 'node-ts') {
      throw new Error(`stack ${flags.stack} not supported until Phase 2`);
    }
    await scaffold({
      stack: 'node-ts',
      targetDir: flags.target ?? process.cwd(),
      name: flags.name,
      license: flags.license,
      workerImage: flags['worker-image'],
      contactEmail: flags['contact-email'],
    });
    this.log(`Scaffolded ${flags.name} (${flags.stack})`);
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npm test -- init
```

Expected: both tests pass.

- [x] **Step 5: Manual smoke test**

```bash
npm run build
mkdir -p /tmp/smoke-app && cd /tmp/smoke-app
node ${REPO}/packages/cli/dist/bin.js init \
  --stack=node-ts --name=smoke-app \
  --worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0
ls -la
```

Expected: full scaffold present, `AGENTS.md` starts with `# smoke-app`.

- [x] **Step 6: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add arandano init command for node-ts stack"
```

---
