> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T2-opencode-gemini-codex-invokers.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md                              ← you are here
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

### Task 2: OpenCode, Gemini, Codex invokers (TDD with shims)

**Goal:** One implementation per provider, each with its own argv/env conventions and `preflight()` checking the right env var.

**Files:**

- Create: `arandano-worker/lib/src/cli/{opencode,gemini,codex}.ts`
- Create: `arandano-worker/lib/src/cli/__tests__/{opencodeInvoker,geminiInvoker,codexInvoker}.test.ts`

- [ ] **Step 1: Implement `OpenCodeInvoker`**

```ts
// lib/src/cli/opencode.ts
import { spawn } from 'node:child_process';
import type { CliInvoker, InvokeOpts, InvokeResult } from './CliInvoker.js';

export class OpenCodeInvoker implements CliInvoker {
  readonly name = 'opencode' as const;
  constructor(private readonly opts: { binPath?: string } = {}) {}
  async invoke(o: InvokeOpts): Promise<InvokeResult> {
    const started = Date.now();
    const bin = this.opts.binPath ?? 'opencode';
    return new Promise((resolve) => {
      const proc = spawn(bin, ['run', '-m', o.model, '--no-interactive'], {
        cwd: o.cwd,
        env: o.env,
      });
      let buf = '';
      proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stderr.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stdin.end(o.prompt);
      const timer = setTimeout(() => proc.kill('SIGTERM'), o.timeoutMs);
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, output: buf, durationMs: Date.now() - started });
      });
    });
  }
  async preflight(): Promise<{ ok: boolean; reason?: string }> {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
      return { ok: false, reason: 'OpenCode needs ANTHROPIC_API_KEY or OPENROUTER_API_KEY' };
    }
    return { ok: true };
  }
}
```

- [ ] **Step 2: Implement `GeminiInvoker`**

```ts
// lib/src/cli/gemini.ts
import { spawn } from 'node:child_process';
import type { CliInvoker, InvokeOpts, InvokeResult } from './CliInvoker.js';

export class GeminiInvoker implements CliInvoker {
  readonly name = 'gemini' as const;
  constructor(private readonly opts: { binPath?: string } = {}) {}
  async invoke(o: InvokeOpts): Promise<InvokeResult> {
    const started = Date.now();
    const bin = this.opts.binPath ?? 'gemini';
    return new Promise((resolve) => {
      const proc = spawn(bin, ['--model', o.model, '--prompt-stdin', '--yolo'], {
        cwd: o.cwd,
        env: o.env,
      });
      let buf = '';
      proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stderr.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stdin.end(o.prompt);
      const timer = setTimeout(() => proc.kill('SIGTERM'), o.timeoutMs);
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, output: buf, durationMs: Date.now() - started });
      });
    });
  }
  async preflight(): Promise<{ ok: boolean; reason?: string }> {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      return { ok: false, reason: 'Gemini needs GEMINI_API_KEY or GOOGLE_API_KEY' };
    }
    return { ok: true };
  }
}
```

- [ ] **Step 3: Implement `CodexInvoker`**

```ts
// lib/src/cli/codex.ts
import { spawn } from 'node:child_process';
import type { CliInvoker, InvokeOpts, InvokeResult } from './CliInvoker.js';

export class CodexInvoker implements CliInvoker {
  readonly name = 'codex' as const;
  constructor(private readonly opts: { binPath?: string } = {}) {}
  async invoke(o: InvokeOpts): Promise<InvokeResult> {
    const started = Date.now();
    const bin = this.opts.binPath ?? 'codex';
    return new Promise((resolve) => {
      const proc = spawn(bin, ['exec', '--model', o.model, '--full-auto', '--cd', o.cwd], {
        cwd: o.cwd,
        env: o.env,
      });
      let buf = '';
      proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stderr.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      proc.stdin.end(o.prompt);
      const timer = setTimeout(() => proc.kill('SIGTERM'), o.timeoutMs);
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, output: buf, durationMs: Date.now() - started });
      });
    });
  }
  async preflight(): Promise<{ ok: boolean; reason?: string }> {
    if (!process.env.OPENAI_API_KEY) return { ok: false, reason: 'Codex needs OPENAI_API_KEY' };
    return { ok: true };
  }
}
```

- [ ] **Step 4: Tests for each — same shape as the Claude Code test**

For each, write a shim binary that captures argv + stdin, then assert the invoker spawns it with the expected args. Verify the right env-var preflight check.

- [ ] **Step 5: Run all invoker tests, commit**

```bash
npm test -- Invoker
git add lib/src/cli/
git commit -m "feat(lib): opencode, gemini, codex invokers"
```

---
