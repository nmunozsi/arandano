> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T1-cliinvoker-interface-claude-code-implementation-ex.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md          ← you are here
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

### Task 1: `CliInvoker` interface + Claude Code implementation extracted (TDD)

**Goal:** Refactor the existing `invokeCli` into a polymorphic `CliInvoker`. Each provider produces the same `{ exitCode, output }` contract but knows its own argv / env conventions.

**Files:**

- Create: `arandano-worker/lib/src/cli/CliInvoker.ts`
- Create: `arandano-worker/lib/src/cli/claudeCode.ts`
- Modify: `arandano-worker/lib/src/driver.ts`
- Create: `arandano-worker/lib/src/cli/__tests__/claudeCodeInvoker.test.ts`

- [ ] **Step 1: Define the interface**

```ts
// lib/src/cli/CliInvoker.ts
export interface InvokeOpts {
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  model: string;
  timeoutMs: number;
}

export interface InvokeResult {
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface CliInvoker {
  readonly name: 'claude-code' | 'opencode' | 'gemini' | 'codex';
  invoke(opts: InvokeOpts): Promise<InvokeResult>;
  preflight(): Promise<{ ok: boolean; reason?: string }>;
}
```

- [ ] **Step 2: Write the failing test for the Claude Code invoker (using a shim binary)**

```ts
// lib/src/cli/__tests__/claudeCodeInvoker.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeInvoker } from '../claudeCode.js';

describe('ClaudeCodeInvoker', () => {
  it('invokes the binary with --print, --model, and pipes the prompt on stdin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-shim-'));
    const shim = join(dir, 'claude');
    await writeFile(
      shim,
      `#!/usr/bin/env node
let stdin = '';
process.stdin.on('data', (c) => (stdin += c.toString('utf8')));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), stdin }));
  process.exit(0);
});
`,
    );
    await chmod(shim, 0o755);
    try {
      const inv = new ClaudeCodeInvoker({ binPath: shim });
      const r = await inv.invoke({
        prompt: 'do the work',
        cwd: dir,
        env: process.env,
        model: 'claude-sonnet-4-6',
        timeoutMs: 5_000,
      });
      const parsed = JSON.parse(r.output);
      expect(parsed.argv).toContain('--print');
      expect(parsed.argv).toContain('--model');
      expect(parsed.argv).toContain('claude-sonnet-4-6');
      expect(parsed.stdin).toBe('do the work');
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
```

- [ ] **Step 3: Implement `ClaudeCodeInvoker`**

```ts
// lib/src/cli/claudeCode.ts
import { spawn } from 'node:child_process';
import type { CliInvoker, InvokeOpts, InvokeResult } from './CliInvoker.js';

export class ClaudeCodeInvoker implements CliInvoker {
  readonly name = 'claude-code' as const;
  constructor(private readonly opts: { binPath?: string } = {}) {}

  async invoke(o: InvokeOpts): Promise<InvokeResult> {
    const started = Date.now();
    const bin = this.opts.binPath ?? 'claude';
    return new Promise((resolve) => {
      const proc = spawn(
        bin,
        ['--print', '--model', o.model, '--allowedTools', 'Bash,Edit,Write,Read,Glob,Grep'],
        {
          cwd: o.cwd,
          env: o.env,
        },
      );
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
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, reason: 'ANTHROPIC_API_KEY not set' };
    }
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test -- claudeCodeInvoker
git add lib/src/cli/
git commit -m "feat(lib): CliInvoker interface and claude-code implementation"
```

---
