> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T8-end-to-end-verification-on-a-real-cluster.md`
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
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md                  ← you are here
> ```

### Task 8: End-to-end verification on a real cluster

**Goal:** On a K3s cluster (homelab), install the chart and run a task.

- [ ] **Step 1: Stand up K3s on the homelab (skip if already there)**

```bash
ssh homelab 'curl -sfL https://get.k3s.io | sh -'
ssh homelab 'sudo cat /etc/rancher/k3s/k3s.yaml' > ~/.kube/homelab
# update server: line in that file to homelab.local:6443
export KUBECONFIG=~/.kube/homelab
kubectl get nodes
```

- [ ] **Step 2: Install the chart**

```bash
helm upgrade --install arandano ./charts/arandano --create-namespace -n arandano \
  --set imagePullSecret.dockerConfigJson="$(cat ~/.docker/config.json | base64 -w0)"
```

- [ ] **Step 3: Switch the toy to `backend: k8s`**

In `arandano-examples/node-ts-toy/.arandano/config.yaml`:

```yaml
executor:
  backend: k8s
  k8s:
    namespace: arandano
    image: ghcr.io/nmunozsi/arandano-worker:latest
    git_url: git@github.com:nmunozsi/arandano-examples-node-ts-toy.git
    git_ref: main
    workdir: /workspace
    env_pass: [GH_TOKEN, ANTHROPIC_API_KEY]
```

- [ ] **Step 4: Run a task**

```bash
arandano run T1
```

Watch:

```bash
kubectl -n arandano get jobs -w
kubectl -n arandano logs -l arandano.io/task-id=T1 -f
```

Expected: Job runs to completion; PR opens.

- [ ] **Step 5: Document**

Append to `arandano-examples/README.md` a "K8s execution" section linking to the PR opened by the K8s-dispatched run.

---
