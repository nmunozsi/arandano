> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T8-implement-config-loader.md`
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
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md                                     ← you are here
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 8: Implement config loader (TDD)

**Goal:** Read `.arandano/config.yaml`, parse YAML, and validate against the schema. Returns a strongly-typed `ProjectConfig`.

**Files:**

- Create: `packages/core/src/config/load.ts`
- Create: `packages/core/src/__tests__/config.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load.js';

const validYaml = `
project:
  name: my-app
  default_branch: main
  stack: node-ts
executor:
  backend: docker
  docker:
    image: ghcr.io/nmunozsi/arandano-worker:0.0.0
    workdir: /workspace
    plugins_mount: baked-in
    env_pass: [GH_TOKEN]
git:
  forge: github
  remote: origin
  branch_prefix: agent/
  open_pr: true
roles:
  coder:
    cli: claude-code
    model: claude-sonnet-4-6
    tdd: strict
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: nonneg }
  security: required
  commit_msg: conventional
  reviewer_required: true
batching:
  max_parallel: 3
  timeout_minutes: 45
  retry_policy:
    max_attempts: 2
    on: [container_error, network_error]
`;

describe('loadConfig', () => {
  it('parses a valid config', () => {
    const cfg = loadConfig(validYaml);
    expect(cfg.project.name).toBe('my-app');
    expect(cfg.executor.backend).toBe('docker');
    expect(cfg.executor.docker?.image).toContain('arandano-worker');
    expect(cfg.roles.coder?.tdd).toBe('strict');
    expect(cfg.quality_defaults.coverage.min).toBe(80);
  });

  it('throws on missing project.name', () => {
    const bad = validYaml.replace('name: my-app', '');
    expect(() => loadConfig(bad)).toThrow(/project\.name|name/);
  });

  it('throws on invalid executor.backend', () => {
    const bad = validYaml.replace('backend: docker', 'backend: nope');
    expect(() => loadConfig(bad)).toThrow(/backend/);
  });

  it('throws on invalid quality coverage delta', () => {
    const bad = validYaml.replace('delta: nonneg', 'delta: lol');
    expect(() => loadConfig(bad)).toThrow(/delta/);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- config.test
```

Expected: fail (`loadConfig` not found).

- [x] **Step 3: Implement `packages/core/src/config/load.ts`**

```ts
import yaml from 'yaml';
import { z } from 'zod';
import type { ProjectConfig } from '../types/config.js';

const GateMode = z.enum(['required', 'warn', 'skip']);

const QualitySpecSchema = z.object({
  format: GateMode,
  lint: GateMode,
  typecheck: GateMode,
  test: GateMode,
  coverage: z.object({
    min: z.number().int().min(0).max(100),
    delta: z.enum(['nonneg', 'any']),
  }),
  security: GateMode,
  commit_msg: z.enum(['conventional', 'freeform', 'skip']),
  reviewer_required: z.boolean(),
});

const RoleConfigSchema = z.object({
  cli: z.string().min(1),
  model: z.string().min(1),
  tdd: z.enum(['strict', 'relaxed']).optional(),
});

const DockerExecutorSchema = z.object({
  host: z.string().optional(),
  image: z.string().min(1),
  workdir: z.string().min(1),
  plugins_mount: z.string().min(1),
  env_pass: z.array(z.string()),
});

const ExecutorSchema = z.object({
  backend: z.enum(['docker', 'k8s', 'local']),
  docker: DockerExecutorSchema.optional(),
});

const GitSchema = z.object({
  forge: z.enum(['github', 'forgejo', 'gitlab', 'none']),
  remote: z.string().min(1),
  branch_prefix: z.string().min(1),
  open_pr: z.boolean(),
});

const McpSchema = z.object({
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'sse']),
  image: z.string().optional(),
  url: z.string().optional(),
});

const BatchingSchema = z.object({
  max_parallel: z.number().int().positive(),
  timeout_minutes: z.number().int().positive(),
  retry_policy: z.object({
    max_attempts: z.number().int().min(0),
    on: z.array(z.enum(['container_error', 'network_error', 'provider_rate_limit'])),
  }),
});

const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  default_branch: z.string().min(1),
  license: z.string().optional(),
  stack: z.enum(['node-ts', 'python', 'go', 'polyglot']).optional(),
});

const ProjectConfigSchema = z.object({
  project: ProjectMetaSchema,
  executor: ExecutorSchema,
  git: GitSchema,
  roles: z.record(RoleConfigSchema),
  mcp: z.record(McpSchema).optional(),
  quality_defaults: QualitySpecSchema,
  batching: BatchingSchema,
});

export function loadConfig(yamlText: string): ProjectConfig {
  const parsed = yaml.parse(yamlText);
  const result = ProjectConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid arandano config: ${issues}`);
  }
  return result.data as ProjectConfig;
}
```

- [x] **Step 4: Export from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
export { loadConfig } from './config/load.js';
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -- config.test
```

Expected: all 4 tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/config/ packages/core/src/__tests__/config.test.ts packages/core/src/index.ts
git commit -m "feat(core): load and validate .arandano/config.yaml"
```

---
