> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T2-scaffold-writer.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md                                              ← you are here
> ├── T3-arandano-init-command.md
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

### Task 2: Scaffold writer (TDD)

**Goal:** A function `scaffold(opts)` that copies the `node-ts/` template tree into a target directory, interpolating `{{name}}`, `{{license}}`, `{{worker_image}}`, `{{contact_email}}` from opts.

**Files:**

- Create: `packages/templates/src/scaffold.ts`
- Create: `packages/templates/src/__tests__/scaffold.test.ts`
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/templates/package.json` (add `globby` dependency, update `files` to include `stacks/`)

- [x] **Step 1: Add `globby` and update `files` in `packages/templates/package.json`**

```bash
npm install globby@14 -w packages/templates
```

In `packages/templates/package.json`, ensure `"files": ["dist", "stacks", "README.md"]`.

- [x] **Step 2: Write the failing tests**

`packages/templates/src/__tests__/scaffold.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-scaffold-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('scaffold', () => {
  it('copies the node-ts template tree to the target dir', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'ghcr.io/nmunozsi/arandano-worker:0.0.0',
      contactEmail: 'me@example.com',
    });

    expect((await stat(join(dir, 'AGENTS.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.prettierrc.json'))).isFile()).toBe(true);
    expect((await stat(join(dir, 'src', 'CONTEXT.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.arandano', 'config.yaml'))).isFile()).toBe(true);
  });

  it('interpolates {{name}} into AGENTS.md', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'y',
    });
    const text = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(text).toContain('# my-app');
  });

  it('interpolates {{worker_image}} into .arandano/config.yaml', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'ghcr.io/x/y:1.2.3',
      contactEmail: 'y',
    });
    const text = await readFile(join(dir, '.arandano', 'config.yaml'), 'utf8');
    expect(text).toContain('image: ghcr.io/x/y:1.2.3');
  });

  it('strips the .tpl suffix from interpolated files', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'a',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'y',
    });
    await expect(stat(join(dir, '.gitignore'))).resolves.toBeDefined();
    await expect(stat(join(dir, '.gitignore.tpl'))).rejects.toThrow();
  });

  it('refuses to overwrite a non-empty target dir', async () => {
    await import('node:fs/promises').then((m) => m.writeFile(join(dir, 'preexisting.txt'), 'hi'));
    await expect(
      scaffold({
        stack: 'node-ts',
        targetDir: dir,
        name: 'a',
        license: 'MIT',
        workerImage: 'x',
        contactEmail: 'y',
      }),
    ).rejects.toThrow(/not empty/);
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

```bash
npm test -- scaffold
```

Expected: fail with "Cannot find module".

- [x] **Step 4: Implement `packages/templates/src/scaffold.ts`**

```ts
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';

export interface ScaffoldOpts {
  stack: 'node-ts';
  targetDir: string;
  name: string;
  license: string;
  workerImage: string;
  contactEmail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const STACKS_ROOT = join(HERE, '..', 'stacks');

function interpolate(text: string, opts: ScaffoldOpts): string {
  return text
    .replaceAll('{{name}}', opts.name)
    .replaceAll('{{license}}', opts.license)
    .replaceAll('{{worker_image}}', opts.workerImage)
    .replaceAll('{{contact_email}}', opts.contactEmail);
}

export async function scaffold(opts: ScaffoldOpts): Promise<void> {
  const src = join(STACKS_ROOT, opts.stack);
  const existing = await safeReaddir(opts.targetDir);
  if (existing.length > 0) {
    throw new Error(`target directory is not empty: ${opts.targetDir}`);
  }

  const files = await globby(['**/*', '**/.*', '**/.*/**'], {
    cwd: src,
    dot: true,
    onlyFiles: true,
  });

  for (const rel of files) {
    const from = join(src, rel);
    const isTpl = rel.endsWith('.tpl');
    const toRel = isTpl ? rel.slice(0, -4) : rel;
    const to = join(opts.targetDir, toRel);
    await mkdir(dirname(to), { recursive: true });
    if (isTpl) {
      const text = await readFile(from, 'utf8');
      await writeFile(to, interpolate(text, opts), 'utf8');
    } else {
      await copyFile(from, to);
    }
  }
}

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
```

- [x] **Step 5: Export from `packages/templates/src/index.ts`**

```ts
export { SUPPORTED_STACKS, isSupportedStack } from './stacks.js';
export { scaffold } from './scaffold.js';
export type { ScaffoldOpts } from './scaffold.js';
```

- [x] **Step 6: Run tests to verify they pass**

```bash
npm test -- scaffold
```

Expected: 5 tests pass.

- [x] **Step 7: Commit**

```bash
git add packages/templates/
git commit -m "feat(templates): scaffold writer with template interpolation"
```

---
