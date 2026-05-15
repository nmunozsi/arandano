> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T4-run-folder-layout-helpers.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md
> ├── T4-run-folder-layout-helpers.md                                    ← you are here
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

### Task 4: Run-folder layout helpers (TDD)

**Goal:** Pure functions that produce paths inside `.arandano/runs/<timestamp>-<task>/` so the executor and worker agree on where artifacts land.

**Files:**

- Create: `packages/core/src/runs/layout.ts`
- Create: `packages/core/src/__tests__/layout.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runFolder, runArtifacts } from '../runs/layout.js';

describe('runFolder', () => {
  it('formats a deterministic folder name', () => {
    const date = new Date('2026-05-08T19:30:00Z');
    expect(runFolder({ taskId: 'T3', date })).toBe('2026-05-08T19-30Z-T3');
  });
});

describe('runArtifacts', () => {
  it('builds journal/result/review paths under .arandano/runs/<folder>', () => {
    const a = runArtifacts({ projectRoot: '/repo', folder: '2026-05-08T19-30Z-T3' });
    expect(a.journal).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/journal.md');
    expect(a.result).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/result.json');
    expect(a.review).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/review.md');
    expect(a.dir).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npm test -- layout
```

- [x] **Step 3: Implement `packages/core/src/runs/layout.ts`**

```ts
import { join } from 'node:path/posix';

export interface RunFolderOpts {
  taskId: string;
  date: Date;
}

export function runFolder({ taskId, date }: RunFolderOpts): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const HH = String(date.getUTCHours()).padStart(2, '0');
  const MM = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${HH}-${MM}Z-${taskId}`;
}

export interface RunArtifactsOpts {
  projectRoot: string;
  folder: string;
}

export interface RunArtifacts {
  dir: string;
  journal: string;
  result: string;
  review: string;
}

export function runArtifacts({ projectRoot, folder }: RunArtifactsOpts): RunArtifacts {
  const dir = join(projectRoot, '.arandano', 'runs', folder);
  return {
    dir,
    journal: join(dir, 'journal.md'),
    result: join(dir, 'result.json'),
    review: join(dir, 'review.md'),
  };
}
```

- [x] **Step 4: Export from `packages/core/src/index.ts`**

Add:

```ts
export { runFolder, runArtifacts } from './runs/layout.js';
export type { RunArtifacts } from './runs/layout.js';
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- layout
```

- [x] **Step 6: Commit**

```bash
git add packages/core/src/runs/ packages/core/src/__tests__/layout.test.ts packages/core/src/index.ts
git commit -m "feat(core): run folder + artifacts path helpers"
```

---
