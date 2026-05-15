> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T6-define-core-types-in-arandano-core.md`
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
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md                          ← you are here
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 6: Define core types in `@arandano/core`

**Goal:** Concrete TypeScript types for everything the orchestrator and worker need. No business logic yet — just the contract.

**Files:**

- Create: `packages/core/src/types/quality.ts`
- Create: `packages/core/src/types/task.ts`
- Create: `packages/core/src/types/role.ts`
- Create: `packages/core/src/types/executor.ts`
- Create: `packages/core/src/types/config.ts`
- Create: `packages/core/src/types/index.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Create `packages/core/src/types/quality.ts`**

```ts
export type GateMode = 'required' | 'warn' | 'skip';
export type CommitMsgStyle = 'conventional' | 'freeform' | 'skip';
export type CoverageDelta = 'nonneg' | 'any';

export interface QualitySpec {
  format: GateMode;
  lint: GateMode;
  typecheck: GateMode;
  test: GateMode;
  coverage: { min: number; delta: CoverageDelta };
  security: GateMode;
  commit_msg: CommitMsgStyle;
  reviewer_required: boolean;
}
```

- [x] **Step 2: Create `packages/core/src/types/task.ts`**

```ts
import type { QualitySpec } from './quality.js';

export type TddMode = 'strict' | 'relaxed';

export interface TaskFrontmatter {
  id: string;
  title: string;
  depends_on?: string[];
  role: string;
  cli?: string;
  model?: string;
  tdd?: TddMode;
  timeout_minutes?: number;
  mcp?: string[];
  tests?: string[];
  acceptance?: string[];
  quality?: Partial<QualitySpec>;
}

export interface TaskMd {
  frontmatter: TaskFrontmatter;
  body: string;
  filePath: string;
}
```

- [x] **Step 3: Create `packages/core/src/types/role.ts`**

```ts
import type { TddMode } from './task.js';

export interface RoleFrontmatter {
  name: string;
  cli: string;
  model: string;
  tdd?: TddMode;
}

export interface RoleMd {
  frontmatter: RoleFrontmatter;
  body: string;
  filePath: string;
}
```

- [x] **Step 4: Create `packages/core/src/types/executor.ts`**

```ts
import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export interface TaskRun {
  taskId: string;
  taskMdPath: string;
  rolePath: string;
  contextPaths: string[];
  cli: string;
  model: string;
  tdd: TddMode;
  quality: QualitySpec;
  envPass: string[];
  workdir: string;
  timeoutMs: number;
  mcpServers: string[];
}

export type ExitReason =
  | 'ok'
  | 'timeout'
  | 'rate_limit'
  | 'error'
  | 'tdd_violation'
  | 'quality_violation';

export interface ExitResult {
  exitCode: number;
  reason: ExitReason;
  resultJsonPath?: string;
  journalPath?: string;
}

export interface Handle {
  id: string;
}

export interface Executor {
  start(task: TaskRun): Promise<Handle>;
  wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult>;
  logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string>;
  cancel(h: Handle): Promise<void>;
}
```

- [x] **Step 5: Create `packages/core/src/types/config.ts`**

```ts
import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export type ExecutorBackend = 'docker' | 'k8s' | 'local';
export type Forge = 'github' | 'forgejo' | 'gitlab' | 'none';
export type Stack = 'node-ts' | 'python' | 'go' | 'polyglot';

export interface DockerExecutorConfig {
  host?: string;
  image: string;
  workdir: string;
  plugins_mount: 'baked-in' | string;
  env_pass: string[];
}

export interface ExecutorConfig {
  backend: ExecutorBackend;
  docker?: DockerExecutorConfig;
}

export interface GitConfig {
  forge: Forge;
  remote: string;
  branch_prefix: string;
  open_pr: boolean;
}

export interface RoleConfig {
  cli: string;
  model: string;
  tdd?: TddMode;
}

export interface McpConfig {
  enabled: boolean;
  transport: 'stdio' | 'sse';
  image?: string;
  url?: string;
}

export interface BatchingConfig {
  max_parallel: number;
  timeout_minutes: number;
  retry_policy: {
    max_attempts: number;
    on: Array<'container_error' | 'network_error' | 'provider_rate_limit'>;
  };
}

export interface ProjectMeta {
  name: string;
  default_branch: string;
  license?: string;
  stack?: Stack;
}

export interface ProjectConfig {
  project: ProjectMeta;
  executor: ExecutorConfig;
  git: GitConfig;
  roles: Record<string, RoleConfig>;
  mcp?: Record<string, McpConfig>;
  quality_defaults: QualitySpec;
  batching: BatchingConfig;
}
```

- [x] **Step 6: Create `packages/core/src/types/index.ts`**

```ts
export * from './quality.js';
export * from './task.js';
export * from './role.js';
export * from './executor.js';
export * from './config.js';
```

- [x] **Step 7: Update `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
```

- [x] **Step 8: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [x] **Step 9: Commit**

```bash
git add packages/core/src/types/ packages/core/src/index.ts
git commit -m "feat(core): define task, role, quality, executor, and config types"
```

---
