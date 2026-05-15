> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T4-config-schema-for-executor-backend-k8s.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md
> ├── T1-scaffold-arandano-executors-k8s-package.md
> ├── T2-job-spec-builder.md
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md
> ├── T4-config-schema-for-executor-backend-k8s.md                     ← you are here
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 4: Config schema for `executor.backend: k8s`

**Goal:** Extend `ProjectConfig` and the loader so a `k8s:` block validates with `namespace`, `kubeconfig_path?`, `context?`, `git_url`, `git_ref`, `image`.

**Files:**

- Modify: `packages/core/src/types/config.ts`
- Modify: `packages/core/src/config/load.ts`
- Modify: `packages/core/src/__tests__/config.test.ts`

- [ ] **Step 1: Add `K8sExecutorConfig`**

```ts
export interface K8sExecutorConfig {
  namespace: string;
  kubeconfig_path?: string;
  context?: string;
  image: string;
  git_url: string;
  git_ref: string;
  workdir: string;
  env_pass: string[];
}

export interface ExecutorConfig {
  backend: ExecutorBackend;
  docker?: DockerExecutorConfig;
  k8s?: K8sExecutorConfig;
}
```

- [ ] **Step 2: Add the schema in `load.ts`**

```ts
const K8sExecutorSchema = z.object({
  namespace: z.string().min(1),
  kubeconfig_path: z.string().optional(),
  context: z.string().optional(),
  image: z.string().min(1),
  git_url: z.string().min(1),
  git_ref: z.string().min(1),
  workdir: z.string().min(1),
  env_pass: z.array(z.string()),
});

const ExecutorSchema = z.object({
  backend: z.enum(['docker', 'k8s', 'local']),
  docker: DockerExecutorSchema.optional(),
  k8s: K8sExecutorSchema.optional(),
});
```

- [ ] **Step 3: Add a test**

```ts
it('parses an executor.backend=k8s config', () => {
  const yaml = validYaml.replace(
    /^executor:[\s\S]*?\n(?=git:)/m,
    `executor:
  backend: k8s
  k8s:
    namespace: arandano
    image: ghcr.io/x/y:1
    git_url: git@github.com:me/repo.git
    git_ref: main
    workdir: /workspace
    env_pass: [GH_TOKEN]
`,
  );
  const cfg = loadConfig(yaml);
  expect(cfg.executor.backend).toBe('k8s');
  expect(cfg.executor.k8s?.namespace).toBe('arandano');
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test
git add packages/core/
git commit -m "feat(core): config schema for executor.backend=k8s"
```

---
