# arandano Phase 3 — Multi-Provider CLI, Coverage Delta, Security Gates Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — Task 1's refactor target and `pickInvoker` wiring point have been pinned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-role CLI/model config real. The worker must dispatch to Claude Code, OpenCode, Gemini CLI, or Codex based on `cli:` in the role/task. Add coverage-delta enforcement (refuse PRs that drop coverage relative to the base branch when `coverage.delta: nonneg`). Promote security from `warn` to `required` by default. Verify every gate path on at least three providers.

**Architecture:** A new `CliInvoker` interface in the worker — one implementation per CLI. The driver picks an invoker based on `ARANDANO_CLI`. Coverage delta needs the base-branch coverage report; the worker checks out `main` in a worktree, runs coverage there, then compares numbers. Security gates already exist (Phase 1/2) — we just flip their default mode and add per-stack hardening.

**Tech Stack:** Adds OpenCode CLI, Gemini CLI, Codex CLI inside the worker image. Adds `c8`/`coverage.py`/`go test -cover` JSON output parsing.

**Reference spec:** `arandano-design.md` §9 (D9, D10), §13.1 (`roles:`), §15.2 (gate ordering), §24 Phase 3.

**Scope deferrals:**

- Per-task budget enforcement (max tokens, max USD) — out of scope for v1 entirely.
- Remote Docker over SSH — Phase 4.

---

## Phase 1 reality check (2026-05-11)

This phase refactors Phase 1's worker `invokeCli`. Lock these in before executing:

**Phase 1 surfaces this plan touches:**

- `invokeCli` — `arandano-worker/lib/src/invokeClaudeCode.ts`:
  ```ts
  export async function invokeCli(opts: {
    cli: string;
    args: string[];
    prompt: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<{ exitCode: number; output: string }>;
  ```
  The implementation `spawn(opts.cli, opts.args, { cwd, env })` and `proc.stdin.end(opts.prompt)` is Windows-compatible because the test passes `cli: process.execPath, args: [script]` rather than relying on shebang execution. **Task 1's `CliInvoker` extraction must preserve the `cli + args` separation** — invokers that want to spawn `node <script>` (in tests) must be able to do so.
- Worker driver — `arandano-worker/lib/src/driver.ts:70-76`:
  ```ts
  const cliRun = await invokeCli({
    cli,
    args: ['--print'],
    prompt,
    cwd: workspace,
    env: process.env,
  });
  ```
  This is the line Task 3's `pickInvoker` replaces. After the refactor it becomes:
  ```ts
  const invoker = pickInvoker(cli);
  const cliRun = await invoker.invoke({
    prompt,
    cwd: workspace,
    env: process.env,
    model,
    timeoutMs,
  });
  ```
- Role config — `packages/core/src/types/role.ts` — the field name is `cli`, **not** `provider`. Task 7's validation extends the Zod schema in this file; check the actual file before writing code blocks that reference `roleConfig.provider`.
- Env-var helper idiom — `arandano-worker/lib/src/driver.ts`:
  ```ts
  const env = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env: ${k}`);
    return v;
  };
  ```
  New invoker code that reads env should follow this pattern, not `process.env.X!`.

**Per-task corrections:**

- **Task 1** (`ClaudeCodeInvoker`): the test's shim binary uses `chmod 0o755 + shebang`, which won't work on Windows (Phase 1 hit this exact issue with `invokeClaudeCode.test.ts`). Use the Phase 1 pattern: `cli: process.execPath, args: [shimScriptPath]` so the test runs on every OS. The container only ever runs on Linux, so the actual `claude` binary invocation is unaffected.
- **Task 1** (driver wiring): the plan's Step 4 says "modify driver.ts to use the new invoker"; the exact replacement target is `driver.ts:70-76` (quoted above). Quote the full `await invokeCli(...)` call when describing the replacement.
- **Task 3** (`pickInvoker`): import path is `../cli/pickInvoker.js`, called from `driver.ts`. Keep the existing `cli` variable name (sourced from `env('ARANDANO_CLI')`); don't rename.
- **Task 7** (per-role config validation): cross-check `packages/core/src/types/role.ts` before drafting Zod schemas — the field is `cli: z.string()` (already there); the validation Phase 3 adds is `.refine((v) => SUPPORTED.includes(v))`. Don't introduce a new `provider` field.
- **General**: `coverageDelta.ts` and the parsers consume `runShell` from `arandano-worker/lib/src/gates/_shell.ts` (Phase 1) — same `ShellResult` shape `{ passed, exitCode, output, durationMs }`.

---

## File Structure

```
arandano-worker/
└── lib/src/
    ├── cli/
    │   ├── CliInvoker.ts                interface
    │   ├── claudeCode.ts
    │   ├── opencode.ts
    │   ├── gemini.ts
    │   ├── codex.ts
    │   ├── pickInvoker.ts
    │   └── __tests__/{pickInvoker,*Invoker}.test.ts
    ├── gates/
    │   ├── coverageDelta.ts             new
    │   ├── parseCoverage/
    │   │   ├── nodeTs.ts                read coverage/coverage-summary.json
    │   │   ├── python.ts                read coverage.json
    │   │   └── go.ts                    read coverage.out
    │   └── __tests__/{parseCoverage/*,coverageDelta}.test.ts
    └── driver.ts                        modify: select invoker by ARANDANO_CLI

arandano/
└── packages/core/src/
    ├── types/role.ts                    extend: cli + model required, validate provider list
    └── config/load.ts                   extend: validate cli ∈ supported set
```

---

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

### Task 4: Coverage parsers per stack (TDD)

**Goal:** Parse stack-specific coverage outputs into a normalized `{ pct: number; lines: { covered: number; total: number } }`.

**Files:**

- Create: `arandano-worker/lib/src/gates/parseCoverage/{nodeTs,python,go}.ts`
- Create: `arandano-worker/lib/src/gates/parseCoverage/__tests__/{nodeTs,python,go}.test.ts`

- [ ] **Step 1: Node-TS test (uses c8/v8 `coverage-summary.json`)**

```ts
import { describe, expect, it } from 'vitest';
import { parseNodeTsCoverage } from '../nodeTs.js';

describe('parseNodeTsCoverage', () => {
  it('extracts total line coverage from coverage-summary.json', () => {
    const json = JSON.stringify({
      total: { lines: { total: 200, covered: 170, pct: 85 } },
    });
    const r = parseNodeTsCoverage(json);
    expect(r.pct).toBe(85);
    expect(r.lines.total).toBe(200);
    expect(r.lines.covered).toBe(170);
  });
});
```

- [ ] **Step 2: Implement `nodeTs.ts`**

```ts
export interface CoverageReport {
  pct: number;
  lines: { covered: number; total: number };
}

export function parseNodeTsCoverage(jsonText: string): CoverageReport {
  const j = JSON.parse(jsonText) as {
    total: { lines: { covered: number; total: number; pct: number } };
  };
  return {
    pct: j.total.lines.pct,
    lines: { covered: j.total.lines.covered, total: j.total.lines.total },
  };
}
```

- [ ] **Step 3: Python implementation — coverage.json**

```ts
export function parsePythonCoverage(jsonText: string): CoverageReport {
  const j = JSON.parse(jsonText) as {
    totals: { num_statements: number; covered_lines: number; percent_covered: number };
  };
  return {
    pct: j.totals.percent_covered,
    lines: { covered: j.totals.covered_lines, total: j.totals.num_statements },
  };
}
```

Test it with a minimal `coverage.json` snippet.

- [ ] **Step 4: Go implementation — `coverage.out`**

```ts
export function parseGoCoverage(text: string): CoverageReport {
  // Lines: `path:start.col,end.col numStatements count`
  let total = 0;
  let covered = 0;
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('mode:')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const stmts = Number(parts[parts.length - 2] ?? '0');
    const count = Number(parts[parts.length - 1] ?? '0');
    total += stmts;
    if (count > 0) covered += stmts;
  }
  const pct = total === 0 ? 100 : (covered * 100) / total;
  return { pct, lines: { covered, total } };
}
```

- [ ] **Step 5: Run all coverage parser tests, commit**

```bash
npm test -- parseCoverage
git add lib/src/gates/parseCoverage/
git commit -m "feat(lib): coverage parsers for node-ts, python, go"
```

---

### Task 5: Coverage-delta gate (TDD)

**Goal:** Run coverage on the current branch, check out a worktree at the base branch and run coverage there, then compare. Refuse if delta < 0 and `coverage.delta: nonneg`.

**Files:**

- Create: `arandano-worker/lib/src/gates/coverageDelta.ts`
- Create: `arandano-worker/lib/src/gates/__tests__/coverageDelta.test.ts`
- Modify: `arandano-worker/lib/src/driver.ts`

- [ ] **Step 1: Write the failing test (pure function, mocked file reads)**

```ts
import { describe, expect, it } from 'vitest';
import { evaluateCoverageDelta } from '../coverageDelta.js';

describe('evaluateCoverageDelta', () => {
  it('passes when current >= base', () => {
    const r = evaluateCoverageDelta({ current: { pct: 85 }, base: { pct: 84 }, mode: 'nonneg' });
    expect(r.passed).toBe(true);
    expect(r.delta).toBeCloseTo(1);
  });
  it('fails when current < base in nonneg mode', () => {
    const r = evaluateCoverageDelta({ current: { pct: 80 }, base: { pct: 85 }, mode: 'nonneg' });
    expect(r.passed).toBe(false);
  });
  it('always passes in any mode', () => {
    const r = evaluateCoverageDelta({ current: { pct: 50 }, base: { pct: 90 }, mode: 'any' });
    expect(r.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Implement the pure logic + a runner**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from './_shell.js';
import type { CoverageReport } from './parseCoverage/nodeTs.js';

export interface DeltaInput {
  current: { pct: number };
  base: { pct: number };
  mode: 'nonneg' | 'any';
}
export interface DeltaResult {
  passed: boolean;
  delta: number;
  reason?: string;
}

export function evaluateCoverageDelta(o: DeltaInput): DeltaResult {
  const delta = o.current.pct - o.base.pct;
  if (o.mode === 'any') return { passed: true, delta };
  return {
    passed: delta >= -0.01,
    delta,
    reason: delta < 0 ? `coverage dropped by ${(-delta).toFixed(2)} points` : undefined,
  };
}

export async function measureBaseCoverage(opts: {
  cwd: string;
  baseBranch: string;
  runCoverageInWorktree: (worktreePath: string) => Promise<CoverageReport>;
}): Promise<CoverageReport> {
  const tmp = await mkdtemp(join(tmpdir(), 'cov-base-'));
  try {
    await runShell({
      cmd: 'git',
      args: ['worktree', 'add', '--detach', tmp, opts.baseBranch],
      cwd: opts.cwd,
    });
    return await opts.runCoverageInWorktree(tmp);
  } finally {
    await runShell({
      cmd: 'git',
      args: ['worktree', 'remove', '--force', tmp],
      cwd: opts.cwd,
    }).catch(() => {});
    await rm(tmp, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Wire into `driver.ts`**

After the existing `coverage` gate runs and parses the current report, add:

```ts
if (quality.coverage.delta === 'nonneg') {
  const runOnWorktree = async (wt: string) => {
    // Re-run coverage in the worktree using the stack's tool. (For node-ts: npx vitest run --coverage; then read coverage/coverage-summary.json.)
    await runShell({ cmd: 'npx', args: ['vitest', 'run', '--coverage'], cwd: wt });
    const text = await readFile(join(wt, 'coverage', 'coverage-summary.json'), 'utf8');
    return parseNodeTsCoverage(text);
  };
  const base = await measureBaseCoverage({
    cwd: workspace,
    baseBranch,
    runCoverageInWorktree: runOnWorktree,
  });
  const delta = evaluateCoverageDelta({
    current: { pct: currentReport.pct },
    base: { pct: base.pct },
    mode: 'nonneg',
  });
  if (!delta.passed)
    return await fail({
      /* reason: quality_violation */
    });
}
```

(Wire equivalents for python/go via the stack switch.)

- [ ] **Step 4: Run tests, commit**

```bash
npm test -- coverageDelta
git add lib/
git commit -m "feat(lib): coverage delta gate vs. base branch"
```

---

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

### Task 8: End-to-end verification on three providers

**Goal:** Manually verify a coder task runs to completion under each of three providers (Claude Code, OpenCode, Gemini). Document results in `arandano-examples/`.

- [ ] **Step 1: In the node-ts-toy, write three near-identical tasks that target different roles**

`.arandano/tasks/2026-05-08-multi-provider/T1-cc.md` — coder role with cli override `claude-code`.
`T2-oc.md` — same, cli `opencode`.
`T3-gem.md` — same, cli `gemini`.

Each task: "Add `src/sum<N>.ts` exporting a `sum` function with a test."

- [ ] **Step 2: Set the env vars**

```bash
export ANTHROPIC_API_KEY=...
export OPENROUTER_API_KEY=...     # for opencode if used
export GEMINI_API_KEY=...
```

Update `config.yaml`'s `executor.docker.env_pass` to include the new keys.

- [ ] **Step 3: Run the plan**

```bash
node ../../arandano/packages/cli/dist/bin.js run --plan=2026-05-08-multi-provider
```

Expected: three PRs open, all green. Inspect `result.json` for each — verify `cli` and `model` fields are correct.

- [ ] **Step 4: Document outcomes**

Append to `arandano-examples/node-ts-toy/README.md`:

```markdown
## Multi-provider verification

| Task | CLI         | Model             | PR  |
| ---- | ----------- | ----------------- | --- |
| T1   | claude-code | claude-sonnet-4-6 | #N  |
| T2   | opencode    | claude-haiku-4-5  | #N  |
| T3   | gemini      | gemini-2.5-pro    | #N  |
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "docs(examples): multi-provider verification run"
```

---

## Phase 3 done — exit criteria

- [ ] Worker dispatches to four CLIs based on `ARANDANO_CLI`; each invoker preflights the right env var
- [ ] `cli` in `roles:` rejects anything outside the supported set
- [ ] Coverage delta vs. base branch is enforced when `coverage.delta: nonneg`
- [ ] Security gate is `required` by default; npm-audit + gitleaks (node-ts), pip-audit + gitleaks (python), govulncheck + gitleaks (go) all run
- [ ] At least three providers verified end-to-end on the node-ts toy

After this, the next plan covers **Phase 4 — Remote homelab Docker (SSH) + CI workflow templates per forge**.
