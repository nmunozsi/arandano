> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T7-per-role-config-validation-in-arandano-core.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md                 ← you are here
> └── T8-end-to-end-verification-on-three-providers.md
> ```

### Task 7: Per-role config validation in `@arandano/core`

**Goal:** When `loadConfig` parses `roles:`, validate that `cli` is one of the supported set and that the model name is non-empty. Reject early.

**Files:**

- Modify: `packages/core/src/config/load.ts`
- Modify: `packages/core/src/__tests__/config.test.ts`

- [ ] **Step 1: Add the failing test**

In `config.test.ts`:

```ts
it('rejects unknown role.cli', () => {
  const bad = validYaml.replace('cli: claude-code', 'cli: cobol');
  expect(() => loadConfig(bad)).toThrow(/cli/);
});
```

- [ ] **Step 2: Tighten the schema**

```ts
const RoleConfigSchema = z.object({
  cli: z.enum(['claude-code', 'opencode', 'gemini', 'codex']),
  model: z.string().min(1),
  tdd: z.enum(['strict', 'relaxed']).optional(),
});
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test
git add packages/core/
git commit -m "feat(core): validate role.cli is a supported provider"
```

---
