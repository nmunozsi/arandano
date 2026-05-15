> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T7-doctor-extension-for-k8s.md`
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
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md                                   ← you are here
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 7: Doctor extension for k8s

**Goal:** When `backend=k8s`, `arandano doctor` validates the cluster connection, the namespace exists, and the SA is present.

**Files:**

- Modify: `packages/cli/src/commands/doctor.ts`

- [ ] **Step 1: Add a k8s branch**

```ts
if (cfg.executor.backend === 'k8s') {
  const k = cfg.executor.k8s!;
  checks.push(
    await tryCheck('k8s context reachable', async () => {
      const { defaultClients } = await import('@arandano/executors-k8s');
      const clients = defaultClients({ kubeconfigPath: k.kubeconfig_path, context: k.context });
      await clients.core.readNamespace({ name: k.namespace });
    }),
  );
  checks.push(
    await tryCheck('k8s SA arandano-worker present', async () => {
      const { defaultClients } = await import('@arandano/executors-k8s');
      const clients = defaultClients({ kubeconfigPath: k.kubeconfig_path, context: k.context });
      await clients.core.readNamespacedServiceAccount({
        name: 'arandano-worker',
        namespace: k.namespace,
      });
    }),
  );
}
```

(Re-export `defaultClients` from `@arandano/executors-k8s` index.)

- [ ] **Step 2: Run, commit**

```bash
git add packages/executors-k8s/src/index.ts packages/cli/
git commit -m "feat(cli): doctor verifies k8s namespace and service account"
```

---
