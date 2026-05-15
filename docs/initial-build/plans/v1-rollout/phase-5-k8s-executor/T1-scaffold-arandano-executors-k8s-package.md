> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T1-scaffold-arandano-executors-k8s-package.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md
> ├── T1-scaffold-arandano-executors-k8s-package.md                    ← you are here
> ├── T2-job-spec-builder.md
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md
> ├── T4-config-schema-for-executor-backend-k8s.md
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 1: Scaffold `@arandano/executors-k8s` package

**Goal:** New workspace package with the same shape as `executors-docker` (build, test, typecheck) and one passing smoke test.

**Files:**

- Create: `packages/executors-k8s/{package.json,tsconfig.json,tsup.config.ts}`
- Create: `packages/executors-k8s/src/index.ts`
- Create: `packages/executors-k8s/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Author `packages/executors-k8s/package.json`**

```json
{
  "name": "@arandano/executors-k8s",
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
    "@arandano/core": "0.0.0",
    "@kubernetes/client-node": "^1.0.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` and `tsup.config.ts`** — mirror `executors-docker`.

- [ ] **Step 3: `src/index.ts`**

```ts
export { K8sExecutor } from './K8sExecutor.js';
```

- [ ] **Step 4: Smoke test**

```ts
// __tests__/smoke.test.ts
import { describe, expect, it } from 'vitest';
import * as mod from '../index.js';
describe('@arandano/executors-k8s', () => {
  it('exports K8sExecutor', () => {
    expect(typeof mod.K8sExecutor).toBe('function');
  });
});
```

- [ ] **Step 5: Install, build, commit**

```bash
npm install
npm run build
npm test -- executors-k8s
git add packages/executors-k8s/ package-lock.json
git commit -m "feat: scaffold @arandano/executors-k8s package"
```

---
