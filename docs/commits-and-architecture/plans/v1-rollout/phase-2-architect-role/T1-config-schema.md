> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T1-config-schema.md`

---

id: T1
title: ArchitectRoleConfig type and config schema
role: coder
tdd: strict

---

# T1 — Config schema for the architect role

**Files:**

- Modify: `packages/core/src/types/config.ts`
- Modify: `packages/core/src/config/load.ts`
- Modify: `packages/core/src/__tests__/loadConfig.test.ts` (or `config/__tests__/load.test.ts` — locate the existing config test before editing)

**Why:** The Orchestrator needs a typed, validated `roles.architect` block (with an `enabled: boolean` defaulting to `true`) before any other code path can reference it.

---

- [ ] **Step 1: Locate the existing config test**

```bash
ls packages/core/src/__tests__
ls packages/core/src/config/__tests__ 2>&1
```

Whichever directory contains a `loadConfig` test, edit that file in the steps below.

- [ ] **Step 2: Write the failing test**

Append to the config test file:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load.js';

describe('architect role config', () => {
  it('parses architect role with enabled boolean', () => {
    const cfg = loadConfig(`
project:
  name: x
  default_branch: main
executor:
  backend: docker
  docker: { image: x, workdir: /w, plugins_mount: baked-in, env_pass: [] }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: true }
roles:
  coder: { cli: claude-code, model: m, tdd: strict }
  architect: { cli: claude-code, model: m, enabled: true }
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: any }
  security: warn
  commit_msg: conventional
  reviewer_required: false
batching:
  max_parallel: 1
  timeout_minutes: 45
  retry_policy: { max_attempts: 1, on: [] }
`);
    expect(cfg.roles.architect).toBeDefined();
    expect(cfg.roles.architect?.enabled).toBe(true);
  });

  it('defaults architect.enabled to true when omitted', () => {
    const cfg = loadConfig(`
project: { name: x, default_branch: main }
executor:
  backend: docker
  docker: { image: x, workdir: /w, plugins_mount: baked-in, env_pass: [] }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: true }
roles:
  architect: { cli: claude-code, model: m }
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: any }
  security: warn
  commit_msg: conventional
  reviewer_required: false
batching:
  max_parallel: 1
  timeout_minutes: 45
  retry_policy: { max_attempts: 1, on: [] }
`);
    expect(cfg.roles.architect?.enabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run the failing test**

```bash
npm test --workspace=@arandano/core -- --reporter=verbose -t "architect role config"
```

Expected: FAIL — `architect.enabled` is undefined because `RoleConfigSchema` doesn't accept the field.

- [ ] **Step 4: Extend the types**

Edit `packages/core/src/types/config.ts`. Add an `enabled?: boolean` to `RoleConfig` and export a named alias for the architect surface (matches the spec's acceptance criterion #11):

```diff
 export interface RoleConfig {
   cli: string;
   model: string;
   tdd?: TddMode;
+  enabled?: boolean;
 }
+
+// Convenience alias: the architect-role config is a normal RoleConfig where
+// `enabled` is non-optional (loadConfig defaults it to true).
+export type ArchitectRoleConfig = RoleConfig & { enabled: boolean };
```

Then re-export from `packages/core/src/types/index.ts` (if that file exists; otherwise from `packages/core/src/index.ts`):

```ts
export type { ArchitectRoleConfig } from './types/config.js';
```

- [ ] **Step 5: Extend the schema**

Edit `packages/core/src/config/load.ts`. Extend `RoleConfigSchema`:

```diff
 const RoleConfigSchema = z.object({
   cli: z.string().min(1),
   model: z.string().min(1),
   tdd: z.enum(['strict', 'relaxed']).optional(),
+  enabled: z.boolean().optional(),
 });
```

Then, AFTER the `result.data` is built, normalize architect.enabled default:

```diff
   if (!result.success) {
     const issues = result.error.issues
       .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
       .join('; ');
     throw new Error(`Invalid arandano config: ${issues}`);
   }
-  return result.data as ProjectConfig;
+  const cfg = result.data as ProjectConfig;
+  if (cfg.roles.architect && cfg.roles.architect.enabled === undefined) {
+    cfg.roles.architect = { ...cfg.roles.architect, enabled: true };
+  }
+  return cfg;
```

- [ ] **Step 6: Re-run the tests**

```bash
npm test --workspace=@arandano/core -- --reporter=verbose -t "architect role config"
```

Expected: PASS.

- [ ] **Step 7: Run the full core test suite**

```bash
npm test --workspace=@arandano/core
```

Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types/config.ts \
        packages/core/src/config/load.ts \
        packages/core/src/__tests__/loadConfig.test.ts
git commit -m ":sparkles: feat(core): architect role config with default enabled=true"
```

> If the test file lives at `packages/core/src/config/__tests__/load.test.ts` instead, adjust the `git add` path accordingly.

## Acceptance

- `RoleConfig.enabled?: boolean` exists in `packages/core/src/types/config.ts`
- `loadConfig` accepts `roles.architect.enabled`
- `loadConfig` defaults `roles.architect.enabled` to `true` when omitted
- Both new tests pass; the existing suite still passes
