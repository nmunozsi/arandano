> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T9-worker-task-reader.md`
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
> ├── T9-worker-task-reader.md                                           ← you are here
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 9: Worker — task reader (TDD)

**Goal:** Inside the worker container, parse `${ARANDANO_TASK_MD}` and produce a `WorkerTask` struct the rest of the worker can use.

**Files (in `arandano-worker/lib/`):**

- Create: `lib/src/readTask.ts`
- Create: `lib/src/__tests__/readTask.test.ts`

- [x] **Step 1: Add `gray-matter` to `arandano-worker/lib/package.json`**

```bash
cd ../arandano-worker/lib
npm install gray-matter@4 zod@3
```

- [x] **Step 2: Write the failing test**

`lib/src/__tests__/readTask.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTask } from '../readTask.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'aw-readtask-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('readTask', () => {
  it('parses the task MD pointed to by env', async () => {
    await mkdir(join(dir, '.arandano', 'tasks'), { recursive: true });
    const tp = join(dir, '.arandano', 'tasks', 'T1-foo.md');
    await writeFile(tp, '---\nid: T1\ntitle: foo\nrole: coder\n---\nbody');
    const t = await readTask({ workspace: dir, taskMdRel: '.arandano/tasks/T1-foo.md' });
    expect(t.id).toBe('T1');
    expect(t.title).toBe('foo');
    expect(t.body).toContain('body');
  });

  it('throws when the file does not exist', async () => {
    await expect(readTask({ workspace: dir, taskMdRel: 'missing.md' })).rejects.toThrow(/missing/);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

```bash
cd lib && npm test -- readTask
```

- [x] **Step 4: Implement `lib/src/readTask.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

const Schema = z.object({
  id: z.string(),
  title: z.string(),
  role: z.string(),
  cli: z.string().optional(),
  model: z.string().optional(),
  tdd: z.enum(['strict', 'relaxed']).optional(),
});

export interface WorkerTask {
  id: string;
  title: string;
  role: string;
  body: string;
  filePath: string;
}

export async function readTask(opts: {
  workspace: string;
  taskMdRel: string;
}): Promise<WorkerTask> {
  const filePath = join(opts.workspace, opts.taskMdRel);
  const text = await readFile(filePath, 'utf8');
  const { data, content } = matter(text);
  const parsed = Schema.parse(data);
  return { id: parsed.id, title: parsed.title, role: parsed.role, body: content, filePath };
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- readTask
```

- [x] **Step 6: Commit (in arandano-worker repo)**

```bash
git add lib/
git commit -m "feat(lib): worker task MD reader"
```

---
