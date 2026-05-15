> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T5-scaffold-arandano-core-with-one-passing-smoke-test.md`
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
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md          ← you are here
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 5: Scaffold `@arandano/core` with one passing smoke test

**Goal:** `@arandano/core` package has a real test runner integrated. Adds the first Vitest test file so the test runner stops reporting "no tests found".

**Files:**

- Create: `packages/core/src/__tests__/version.test.ts`

- [x] **Step 1: Write the failing test**

`packages/core/src/__tests__/version.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../index.js';

describe('@arandano/core', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [x] **Step 2: Run the test to verify it passes**

```bash
npm test
```

Expected: 1 test file, 1 test passing. (`VERSION` is `'0.0.0'` from Task 2 step 7, which matches the regex.)

- [x] **Step 3: Commit**

```bash
git add packages/core/src/__tests__/version.test.ts
git commit -m "test(core): add VERSION smoke test"
```

---
