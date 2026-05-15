> **Location:** `docs/initial-build/plans/v1-rollout/phase-5-k8s-executor/phase.md`
>
> **Folder structure:**
>
> ```
> phase-5-k8s-executor/
> ├── phase.md                                                         ← you are here
> ├── T1-scaffold-arandano-executors-k8s-package.md
> ├── T2-job-spec-builder.md
> ├── T3-k8sexecutor-wiring-against-kubernetes-client-node.md
> ├── T4-config-schema-for-executor-backend-k8s.md
> ├── T5-cli-selects-executor-by-backend.md
> ├── T6-helm-chart-for-the-homelab-cluster.md
> ├── T7-doctor-extension-for-k8s.md
> └── T8-end-to-end-verification-on-a-real-cluster.md
> ```

# arandano Phase 5 — Kubernetes Executor Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — the `Executor` interface, `DockerExecutor` reference, and CLI executor-switch wiring are pinned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second `Executor` implementation that creates Kubernetes Jobs instead of Docker containers. Ship a Helm chart that prepares a namespace with the right RBAC, secret-pull permissions, and a PVC pattern for project workspaces. The CLI gains `executor.backend: k8s` config, and `arandano run` works against a homelab K3s/K8s cluster the same way it works against Docker.

**Architecture:** New `@arandano/executors-k8s` package using `@kubernetes/client-node`. Each task spawns a Kubernetes `Job` with `restartPolicy: Never`, a `PersistentVolumeClaim` for the workspace (or an `emptyDir` populated via an `initContainer` that `git clone`s the repo), and an explicit `serviceAccount` granted by the Helm chart. The driver streams logs via `Pod.log()` follows. Cancellation deletes the Job (cascades to the Pod).

**Tech Stack:** `@kubernetes/client-node` 1.x, Helm 3, kustomize-style overlays for dev/homelab/prod.

**Reference spec:** `arandano-design.md` §18 (`Executor` interface, "K8s executor (Phase 5)"), §24 Phase 5.

**Scope deferrals:**

- Multi-cluster support — out of scope; one cluster per `arandano` invocation.
- Network policy hardening beyond denying egress except to MCP/registries — defer to a follow-up plan.

---

## Phase 1 reality check (2026-05-11)

This phase adds a second `Executor` implementation. The contract is fully nailed down by Phase 1 — implement exactly what's below.

**Locked-in Phase 1 surfaces:**

- `Executor` interface — `packages/core/src/types/executor.ts:38-43`:
  ```ts
  export interface Executor {
    start(task: TaskRun): Promise<Handle>;
    wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult>;
    logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string>;
    cancel(h: Handle): Promise<void>;
  }
  ```
- `Handle = { id: string }` — `packages/core/src/types/executor.ts:34-36`.
- `ExitResult` — `packages/core/src/types/executor.ts:27-32`:
  ```ts
  export interface ExitResult {
    exitCode: number;
    reason: 'ok' | 'timeout' | 'rate_limit' | 'error' | 'tdd_violation' | 'quality_violation';
    resultJsonPath?: string;
    journalPath?: string;
  }
  ```
- `TaskRun` — `packages/core/src/types/executor.ts:4-17` — passes the full task context: `taskId`, `taskMdPath`, `rolePath`, `contextPaths`, `cli`, `model`, `tdd`, `quality`, `envPass`, `workdir`, `timeoutMs`, `mcpServers`.
- Reference implementation: `packages/executors-docker/src/DockerExecutor.ts` (entire file). Mirror its `Map<handleId, {containerId, container, folder}>` running-set pattern for K8s pods/jobs.
- Run folder format: `YYYY-MM-DDTHH-MMZ-<taskId>` from `packages/core/src/runs/layout.ts`. K8s artifacts go in the same location.
- Env vars set in `containerSpec.ts` (the env contract the worker driver consumes): `ARANDANO_TASK_ID`, `ARANDANO_TASK_MD`, `ARANDANO_ROLE_MD`, `ARANDANO_CLI`, `ARANDANO_MODEL`, `ARANDANO_TDD`, `ARANDANO_RUN_FOLDER`, `ARANDANO_QUALITY_JSON`, `ARANDANO_CONTEXT_PATHS` + `task.envPass`. K8s Job spec must inject these as `env:` entries (or via `envFrom: secretRef`).
- Reference `package.json` for new executor packages — `packages/executors-docker/package.json` is the template (deps: `@arandano/core`, `dockerode`; devDeps: `tsup`, `typescript`, `vitest`, `@types/node`).
- CLI command pattern — `packages/cli/src/commands/run.ts:22-23` currently hardcodes Docker:
  ```ts
  const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });
  ```
  Task 5 replaces this with a `pickExecutor(cfg)` switch.
- CLI exit-code idiom: `process.exit(code)`, not `this.exit(code)`.

**Per-task corrections:**

- **Task 1** (scaffold `executors-k8s` package): mirror `packages/executors-docker/package.json` **exactly** for scripts/devDeps. Use `"@arandano/core": "*"` (workspace dep), not `"0.0.0"` — the plan's example `"@arandano/core": "0.0.0"` works today but breaks once core is versioned independently. Check what `executors-docker` actually uses and copy that.
- **Task 3** (`K8sExecutor` wiring): cite `DockerExecutor.ts` as the reference. `Handle.id` should be unique per task (DockerExecutor uses `${taskId}::${container.id}`); for K8s use `${taskId}::${jobName}`. Use a `Map<string, {jobName: string, namespace: string, folder: string}>` running-set.
- **Task 3** (logs/cancel): `logs()` returns `AsyncIterable<string>`; convert k8s pod log streams to string chunks. `cancel()` should `deleteJob(name, { propagationPolicy: 'Foreground' })` so child pods are reaped.
- **Task 5** (CLI selects executor): the exact line being replaced is `run.ts:22`. After the refactor:
  ```ts
  const executor = pickExecutor(cfg, projectRoot); // returns DockerExecutor or K8sExecutor based on cfg.executor.backend
  ```
  Put `pickExecutor` in `packages/cli/src/lib/pickExecutor.ts` (new file) so Phase 2's plan dispatcher (`run --plan`) can share it.
- **Task 4** (config schema): the existing config schema lives in `packages/core/src/types/config.ts`. Add a `KubernetesExecutorConfig` union member; don't replace the existing `DockerExecutorConfig`. Validate via Zod in `packages/core/src/config/load.ts`.
- **Sequencing**: Phase 5 Task 5 (CLI executor switch) overlaps with Phase 2 Task 6 (`--plan` flag in `run.ts`). Whichever phase ships first owns the `pickExecutor` extraction; the other phase consumes it.

---

## File Structure

```
arandano/
├── packages/executors-k8s/                  new package
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── K8sExecutor.ts
│   │   ├── jobSpec.ts                       pure builder
│   │   ├── client.ts                        @kubernetes/client-node factory
│   │   ├── watchJob.ts                      poll/watch helper
│   │   └── __tests__/{jobSpec,K8sExecutor}.test.ts
├── packages/cli/src/commands/run.ts         modify: pick executor by backend
├── packages/core/src/config/load.ts         modify: validate k8s config block
└── packages/core/src/types/config.ts        modify: K8sExecutorConfig

charts/
└── arandano/                                Helm chart for the homelab
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── namespace.yaml
        ├── serviceaccount.yaml
        ├── role.yaml
        ├── rolebinding.yaml
        └── secret.yaml                      registry pull secret (template)
```

---

## Tasks

- [ ] [T1 — Scaffold `@arandano/executors-k8s` package](T1-scaffold-arandano-executors-k8s-package.md)
- [ ] [T2 — Job spec builder (TDD)](T2-job-spec-builder.md)
- [ ] [T3 — K8sExecutor wiring against `@kubernetes/client-node` (TDD with mocks)](T3-k8sexecutor-wiring-against-kubernetes-client-node.md)
- [ ] [T4 — Config schema for `executor.backend: k8s`](T4-config-schema-for-executor-backend-k8s.md)
- [ ] [T5 — CLI selects executor by backend](T5-cli-selects-executor-by-backend.md)
- [ ] [T6 — Helm chart for the homelab cluster](T6-helm-chart-for-the-homelab-cluster.md)
- [ ] [T7 — Doctor extension for k8s](T7-doctor-extension-for-k8s.md)
- [ ] [T8 — End-to-end verification on a real cluster](T8-end-to-end-verification-on-a-real-cluster.md)

---

## Exit criteria

## Phase 5 done — exit criteria

- [ ] `executor.backend: k8s` is fully wired through CLI → core → executor
- [ ] `K8sExecutor` creates Jobs that complete and emit logs and PRs identically to the Docker executor
- [ ] Helm chart installs cleanly on a fresh K3s cluster
- [ ] `arandano doctor` validates k8s connectivity when `backend=k8s`
- [ ] At least one end-to-end task is dispatched on a real cluster and lands a PR

After this, the next plan covers **Phase 6 — daemon mode (HTTP API + SQLite state)**.
