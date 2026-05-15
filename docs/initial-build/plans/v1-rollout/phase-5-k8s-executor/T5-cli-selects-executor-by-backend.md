> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T5-cli-selects-executor-by-backend.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md
> ├── T1-scaffold-arandano-executors-k8s-package.md
> ├── T2-job-spec-builder.md
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md
> ├── T4-config-schema-for-executor-backend-k8s.md
> ├── T5-cli-selects-executor-by-backend.md                            ← you are here
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 5: CLI selects executor by backend

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/package.json` — add dependency on `@arandano/executors-k8s`

- [ ] **Step 1: Update `run.ts`**

```ts
import { DockerExecutor } from '@arandano/executors-docker';
import { K8sExecutor } from '@arandano/executors-k8s';
// ...

const cfg = loadConfig(await readFile(...));
let executor: Executor;
if (cfg.executor.backend === 'docker') {
  executor = new DockerExecutor({ image: cfg.executor.docker!.image, host: cfg.executor.docker!.host, projectRoot });
} else if (cfg.executor.backend === 'k8s') {
  const k = cfg.executor.k8s!;
  executor = new K8sExecutor({
    image: k.image, namespace: k.namespace, gitUrl: k.git_url, gitRef: k.git_ref,
  });
} else {
  throw new Error(`backend ${cfg.executor.backend} not supported`);
}
```

- [ ] **Step 2: Add cli dependency, run tests, commit**

```bash
npm install @arandano/executors-k8s -w packages/cli
npm test
git add packages/cli/ package-lock.json
git commit -m "feat(cli): select K8sExecutor when backend=k8s"
```

---
