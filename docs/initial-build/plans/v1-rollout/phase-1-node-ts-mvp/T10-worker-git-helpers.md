> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T10-worker-git-helpers.md`
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
> ├── T10-worker-git-helpers.md                                          ← you are here
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 10: Worker — git helpers (TDD)

**Goal:** Helpers to detect base branch, create the agent branch, and detect TDD red→green sequence in the commit graph.

**Files:**

- Create: `lib/src/git.ts`
- Create: `lib/src/tdd.ts`
- Create: `lib/src/__tests__/tdd.test.ts`

- [x] **Step 1: Implement `lib/src/git.ts` (thin shell wrapper)**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec('git', args, { cwd });
  return stdout.trim();
}

export async function currentBranch(cwd: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  await git(['checkout', '-b', name], cwd);
}

export async function commitSubjects(cwd: string, base: string): Promise<string[]> {
  const out = await git(['log', `${base}..HEAD`, '--pretty=%s'], cwd);
  return out.length ? out.split('\n') : [];
}
```

- [x] **Step 2: Write the failing TDD-detection test**

`lib/src/__tests__/tdd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectRedGreen } from '../tdd.js';

describe('detectRedGreen', () => {
  it('returns ok when test commit precedes feat/fix', () => {
    const r = detectRedGreen(['test: add failing case', 'feat: implement']);
    expect(r.ok).toBe(true);
  });
  it('fails when only feat commits exist', () => {
    expect(detectRedGreen(['feat: implement']).ok).toBe(false);
  });
  it('fails when feat precedes test', () => {
    expect(detectRedGreen(['feat: implement', 'test: add case']).ok).toBe(false);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

```bash
npm test -- tdd
```

- [x] **Step 4: Implement `lib/src/tdd.ts`**

```ts
export interface TddResult {
  ok: boolean;
  reason?: string;
}

export function detectRedGreen(subjectsOldestFirst: string[]): TddResult {
  let testIdx = -1;
  let implIdx = -1;
  for (let i = 0; i < subjectsOldestFirst.length; i += 1) {
    const s = subjectsOldestFirst[i] ?? '';
    if (testIdx === -1 && s.startsWith('test:')) testIdx = i;
    if (implIdx === -1 && (s.startsWith('feat:') || s.startsWith('fix:'))) implIdx = i;
  }
  if (testIdx === -1) return { ok: false, reason: 'no test: commit' };
  if (implIdx === -1) return { ok: false, reason: 'no feat:/fix: commit' };
  if (testIdx >= implIdx) return { ok: false, reason: 'test commit must precede impl commit' };
  return { ok: true };
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- tdd
```

- [x] **Step 6: Commit**

```bash
git add lib/
git commit -m "feat(lib): git helpers and TDD red->green detection"
```

---
