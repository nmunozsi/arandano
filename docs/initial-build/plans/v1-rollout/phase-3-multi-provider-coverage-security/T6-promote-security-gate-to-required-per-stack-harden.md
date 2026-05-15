> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T6-promote-security-gate-to-required-per-stack-harden.md`
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
> ├── T6-promote-security-gate-to-required-per-stack-harden.md          ← you are here
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

### Task 6: Promote security gate to required + per-stack hardening

**Goal:** Default `quality_defaults.security: required` in all template configs. Worker enforces it. Add gitleaks as a separate sub-step.

**Files:**

- Modify: `packages/templates/stacks/{node-ts,python,go}/.arandano/config.yaml.tpl` (`security: required`)
- Modify: `arandano-worker/lib/src/gates/security.ts` (split into npm-audit + gitleaks for node-ts, etc.)

- [ ] **Step 1: Update the templates**

In each stack's `config.yaml.tpl`, change `security: warn` to `security: required`.

- [ ] **Step 2: Update `lib/src/gates/security.ts` to run two sub-checks for node-ts**

```ts
import { runShell, type ShellResult } from './_shell.js';

export async function nodeTsSecurityGate(cwd: string): Promise<ShellResult> {
  const audit = await runShell({ cmd: 'npm', args: ['audit', '--audit-level=high'], cwd });
  if (!audit.passed) return audit;
  const leaks = await runShell({
    cmd: 'gitleaks',
    args: ['detect', '--no-banner', '--redact', '--source', '.'],
    cwd,
  });
  return leaks;
}
```

Equivalent for python (pip-audit + gitleaks) and go (govulncheck + gitleaks).

- [ ] **Step 3: Update the gate maps in `driver.ts`**

```ts
gates: {
  // ...
  security: { mode: quality.security, run: () => stack === 'node-ts' ? nodeTsSecurityGate(workspace) : stack === 'python' ? pythonSecurityGate(workspace) : goSecurityGate(workspace) },
}
```

- [ ] **Step 4: Run e2e on a toy with a known-vulnerable dep to confirm the gate fails**

In `arandano-examples/node-ts-toy`:

```bash
npm install lodash@4.17.20  # had advisories at one point — pick any with known issues
node ../../arandano/packages/cli/dist/bin.js run T1
```

Expected: worker exits with `quality_violation`; `result.json` shows `security.passed: false`.

- [ ] **Step 5: Commit (in both repos)**

```bash
# arandano
git add packages/templates/
git commit -m "feat(templates): security gate required by default"

# arandano-worker
git add lib/
git commit -m "feat(lib): split security into vuln scan + gitleaks per stack"
```

---
