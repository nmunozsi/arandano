> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T10-scaffold-remaining-packages.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md                                ← you are here
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 10: Scaffold remaining packages (`executors-docker`, `templates`, `skills`, `cli`)

**Goal:** Four more packages exist under `packages/`, build, type-check, and have one passing smoke test each. No real logic yet — Phase 1 fills these in.

**Files:**

- Create: `packages/executors-docker/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/DockerExecutor.ts, src/__tests__/DockerExecutor.test.ts}`
- Create: `packages/templates/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/stacks.ts, src/__tests__/stacks.test.ts}`
- Create: `packages/skills/{package.json, tsconfig.json, tsup.config.ts, src/index.ts, src/registry.ts, src/__tests__/registry.test.ts}`
- Create: `packages/cli/{package.json, tsconfig.json, tsup.config.ts, src/bin.ts, src/cli.ts, src/__tests__/cli.test.ts}`

- [x] **Step 1: Create `packages/executors-docker/package.json`**

```json
{
  "name": "@arandano/executors-docker",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0"
  }
}
```

`packages/executors-docker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

`packages/executors-docker/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

- [x] **Step 2: Create `packages/executors-docker/src/DockerExecutor.ts` (stub)**

```ts
import type { Executor, Handle, ExitResult, TaskRun } from '@arandano/core';

export class DockerExecutor implements Executor {
  start(_task: TaskRun): Promise<Handle> {
    throw new Error('DockerExecutor.start: not implemented (Phase 1)');
  }
  wait(_h: Handle, _opts?: { timeoutMs: number }): Promise<ExitResult> {
    throw new Error('DockerExecutor.wait: not implemented (Phase 1)');
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async *logs(_h: Handle, _opts?: { follow: boolean }): AsyncIterable<string> {
    throw new Error('DockerExecutor.logs: not implemented (Phase 1)');
  }
  cancel(_h: Handle): Promise<void> {
    throw new Error('DockerExecutor.cancel: not implemented (Phase 1)');
  }
}
```

`packages/executors-docker/src/index.ts`:

```ts
export { DockerExecutor } from './DockerExecutor.js';
```

- [x] **Step 3: Smoke test for executors-docker**

`packages/executors-docker/src/__tests__/DockerExecutor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';

describe('DockerExecutor (Phase 0 stub)', () => {
  it('throws not implemented for start', async () => {
    const e = new DockerExecutor();
    await expect(
      e.start({
        taskId: 'T1',
        taskMdPath: '',
        rolePath: '',
        contextPaths: [],
        cli: 'claude-code',
        model: 'x',
        tdd: 'strict',
        quality: {
          format: 'required',
          lint: 'required',
          typecheck: 'required',
          test: 'required',
          coverage: { min: 80, delta: 'nonneg' },
          security: 'required',
          commit_msg: 'conventional',
          reviewer_required: true,
        },
        envPass: [],
        workdir: '/x',
        timeoutMs: 1000,
        mcpServers: [],
      }),
    ).rejects.toThrow(/not implemented/);
  });
});
```

- [x] **Step 4: Create `packages/templates` (similar shape)**

`packages/templates/package.json`:

```json
{
  "name": "@arandano/templates",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "stacks", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0"
  }
}
```

`packages/templates/tsconfig.json`, `tsup.config.ts`: mirror executors-docker.

`packages/templates/src/stacks.ts`:

```ts
import type { Stack } from '@arandano/core';

export const SUPPORTED_STACKS: Stack[] = ['node-ts', 'python', 'go', 'polyglot'];

export function isSupportedStack(s: string): s is Stack {
  return (SUPPORTED_STACKS as string[]).includes(s);
}
```

`packages/templates/src/index.ts`:

```ts
export { SUPPORTED_STACKS, isSupportedStack } from './stacks.js';
```

`packages/templates/src/__tests__/stacks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SUPPORTED_STACKS, isSupportedStack } from '../stacks.js';

describe('templates stack registry', () => {
  it('lists the four supported stacks', () => {
    expect(SUPPORTED_STACKS).toEqual(['node-ts', 'python', 'go', 'polyglot']);
  });

  it('isSupportedStack accepts known and rejects unknown', () => {
    expect(isSupportedStack('node-ts')).toBe(true);
    expect(isSupportedStack('rust')).toBe(false);
  });
});
```

- [x] **Step 4b: Create `packages/skills` (registry stub)**

`packages/skills/package.json`:

```json
{
  "name": "@arandano/skills",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "skills", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/skills/tsconfig.json`, `tsup.config.ts`: mirror executors-docker.

`packages/skills/src/registry.ts`:

```ts
export interface SkillMeta {
  name: string;
  description: string;
}

// Phase 1 fills this in with real skill definitions; Phase 0 just ships the registry shape.
export const BUNDLED_SKILLS: SkillMeta[] = [];
```

`packages/skills/src/index.ts`:

```ts
export { BUNDLED_SKILLS } from './registry.js';
export type { SkillMeta } from './registry.js';
```

`packages/skills/src/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUNDLED_SKILLS } from '../registry.js';

describe('@arandano/skills (Phase 0 registry stub)', () => {
  it('exports an array (empty in Phase 0)', () => {
    expect(Array.isArray(BUNDLED_SKILLS)).toBe(true);
  });
});
```

- [x] **Step 5: Create `packages/cli` with oclif skeleton**

```bash
npm install oclif@4 @oclif/core@4 -w packages/cli
```

(If `npm install -w` flagging fails because the package doesn't exist yet, first create `packages/cli/package.json` then run install.)

`packages/cli/package.json`:

```json
{
  "name": "@arandano/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "arandano": "./dist/bin.js" },
  "main": "./dist/cli.js",
  "types": "./dist/cli.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@arandano/core": "0.0.0",
    "@arandano/executors-docker": "0.0.0",
    "@arandano/templates": "0.0.0",
    "@oclif/core": "^4.0.0"
  },
  "oclif": {
    "bin": "arandano",
    "commands": "./dist/commands"
  }
}
```

`packages/cli/tsconfig.json`, `tsup.config.ts`: mirror others; `tsup.config.ts` adds `bin.ts` to the entry list:

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/bin.ts', 'src/cli.ts', 'src/commands/*.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

`packages/cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { execute } from '@oclif/core';

await execute({ dir: import.meta.url });
```

`packages/cli/src/cli.ts`:

```ts
export const APP_NAME = 'arandano';
```

`packages/cli/src/commands/version.ts`:

```ts
import { Command } from '@oclif/core';
import { VERSION } from '@arandano/core';

export default class Version extends Command {
  static override description = 'Show the arandano version';
  async run(): Promise<void> {
    this.log(`arandano ${VERSION}`);
  }
}
```

`packages/cli/src/__tests__/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../cli.js';

describe('@arandano/cli (Phase 0 skeleton)', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('arandano');
  });
});
```

- [x] **Step 6: Build the workspace and run tests**

```bash
npm install     # picks up new packages and links workspace deps
npm run build
npm test
```

Expected: all packages build; all tests pass.

- [x] **Step 7: Run all gates one more time**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run audit
```

Expected: all green.

- [x] **Step 8: Commit**

```bash
git add packages/executors-docker/ packages/templates/ packages/skills/ packages/cli/ package-lock.json package.json
git commit -m "feat: scaffold executors-docker, templates, skills, and cli packages"
```

- [x] **Step 9: Open PR (or push to main if branch protection isn't enforced yet)**

```bash
git push origin main
# or, if branch protection is on:
git checkout -b feat/scaffold-packages
git push -u origin feat/scaffold-packages
gh pr create --fill
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---
