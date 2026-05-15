> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/T6-helm-chart-for-the-homelab-cluster.md`
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
> ├── T6-helm-chart-for-the-homelab-cluster.md                         ← you are here
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

### Task 6: Helm chart for the homelab cluster

**Goal:** A chart that, when installed, prepares the `arandano` namespace, ServiceAccount, RBAC, and an image-pull secret template.

**Files:**

- Create: `charts/arandano/Chart.yaml`
- Create: `charts/arandano/values.yaml`
- Create: `charts/arandano/templates/{namespace,serviceaccount,role,rolebinding,secret}.yaml`

- [ ] **Step 1: `Chart.yaml`**

```yaml
apiVersion: v2
name: arandano
description: Namespace + RBAC for arandano workers
type: application
version: 0.1.0
appVersion: '0.1.0'
```

- [ ] **Step 2: `values.yaml`**

```yaml
namespace: arandano
serviceAccount:
  name: arandano-worker
imagePullSecret:
  enabled: true
  name: ghcr-pull
  dockerConfigJson: '' # base64-encoded; user supplies via --set or a Sealed Secret
```

- [ ] **Step 3: `templates/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: { { .Values.namespace } }
```

- [ ] **Step 4: `templates/serviceaccount.yaml`**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceAccount.name }}
  namespace: {{ .Values.namespace }}
{{- if .Values.imagePullSecret.enabled }}
imagePullSecrets:
  - name: {{ .Values.imagePullSecret.name }}
{{- end }}
```

- [ ] **Step 5: `templates/role.yaml`**

The worker only needs to read its own pod (for self-introspection in logs). The orchestrator creates Jobs from outside the cluster, so the worker SA stays minimal.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: arandano-worker
  namespace: { { .Values.namespace } }
rules:
  - apiGroups: ['']
    resources: ['pods']
    verbs: ['get', 'list', 'watch']
```

- [ ] **Step 6: `templates/rolebinding.yaml`**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: arandano-worker
  namespace: { { .Values.namespace } }
subjects:
  - kind: ServiceAccount
    name: { { .Values.serviceAccount.name } }
    namespace: { { .Values.namespace } }
roleRef:
  kind: Role
  name: arandano-worker
  apiGroup: rbac.authorization.k8s.io
```

- [ ] **Step 7: `templates/secret.yaml`**

```yaml
{{- if and .Values.imagePullSecret.enabled .Values.imagePullSecret.dockerConfigJson }}
apiVersion: v1
kind: Secret
type: kubernetes.io/dockerconfigjson
metadata:
  name: {{ .Values.imagePullSecret.name }}
  namespace: {{ .Values.namespace }}
data:
  .dockerconfigjson: {{ .Values.imagePullSecret.dockerConfigJson }}
{{- end }}
```

- [ ] **Step 8: Lint and dry-render**

```bash
helm lint charts/arandano
helm template arandano charts/arandano > /tmp/render.yaml
```

Expected: clean lint; rendered yaml is valid kubernetes manifests.

- [ ] **Step 9: Document install**

Append to `docs/setup-guide.md`:

````markdown
## Optional — install on Kubernetes

If you'd rather run workers as K8s Jobs (e.g., on a homelab K3s cluster):

1. Set `executor.backend: k8s` in `.arandano/config.yaml` and add a `k8s:` block.
2. Install the chart on your cluster:

```bash
helm upgrade --install arandano ./charts/arandano \
  --create-namespace --namespace arandano \
  --set imagePullSecret.dockerConfigJson="$(cat ~/.docker/config.json | base64 -w0)"
```
````

3. Make sure your laptop's `kubectl` context points at that cluster (`kubectl config use-context homelab`).
4. Run `arandano doctor` — it will exercise the cluster connection.

````

- [ ] **Step 10: Commit**

```bash
git add charts/ docs/setup-guide.md
git commit -m "feat: helm chart for arandano namespace + RBAC"
````

---
