> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T3-pickinvoker-factory-driver-wiring.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md                           ← you are here
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

### Task 3: `pickInvoker(name)` factory + driver wiring (TDD)

**Goal:** Map `ARANDANO_CLI` to a concrete invoker. Reject unknown names. Driver calls `preflight()` before doing anything else.

**Files:**

- Create: `arandano-worker/lib/src/cli/pickInvoker.ts`
- Create: `arandano-worker/lib/src/cli/__tests__/pickInvoker.test.ts`
- Modify: `arandano-worker/lib/src/driver.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/pickInvoker.test.ts
import { describe, expect, it } from 'vitest';
import { pickInvoker } from '../pickInvoker.js';

describe('pickInvoker', () => {
  it('returns the right class for each known name', () => {
    expect(pickInvoker('claude-code').name).toBe('claude-code');
    expect(pickInvoker('opencode').name).toBe('opencode');
    expect(pickInvoker('gemini').name).toBe('gemini');
    expect(pickInvoker('codex').name).toBe('codex');
  });
  it('throws on unknown', () => {
    expect(() => pickInvoker('cobol' as never)).toThrow(/unknown cli/);
  });
});
```

- [ ] **Step 2: Implement `pickInvoker.ts`**

```ts
import type { CliInvoker } from './CliInvoker.js';
import { ClaudeCodeInvoker } from './claudeCode.js';
import { OpenCodeInvoker } from './opencode.js';
import { GeminiInvoker } from './gemini.js';
import { CodexInvoker } from './codex.js';

export type CliName = 'claude-code' | 'opencode' | 'gemini' | 'codex';

export function pickInvoker(name: CliName): CliInvoker {
  switch (name) {
    case 'claude-code':
      return new ClaudeCodeInvoker();
    case 'opencode':
      return new OpenCodeInvoker();
    case 'gemini':
      return new GeminiInvoker();
    case 'codex':
      return new CodexInvoker();
    default:
      throw new Error(`unknown cli: ${name as string}`);
  }
}
```

- [ ] **Step 3: Update driver to use `pickInvoker`**

In `lib/src/driver.ts` replace the previous `invokeCli` call:

```ts
import { pickInvoker, type CliName } from './cli/pickInvoker.js';

const invoker = pickInvoker(cli as CliName);
const pre = await invoker.preflight();
if (!pre.ok) {
  log(`preflight failed: ${pre.reason ?? 'unknown'}`);
  return await fail({ /* … */ reason: 'cli_preflight_failed' });
}
const cliRun = await invoker.invoke({
  prompt,
  cwd: workspace,
  env: process.env,
  model: process.env.ARANDANO_MODEL!,
  timeoutMs: 30 * 60_000,
});
```

- [ ] **Step 4: Update Dockerfile to install all four CLIs**

```dockerfile
RUN npm install -g @anthropic-ai/claude-code opencode-ai @google/gemini-cli @openai/codex
```

(Versions pinned; adjust package names if upstream releases differ.)

- [ ] **Step 5: Build, smoke-test, commit**

```bash
docker build -t arandano-worker:dev .
npm test
git add .
git commit -m "feat: bundle four CLIs and pick invoker by ARANDANO_CLI"
```

---
