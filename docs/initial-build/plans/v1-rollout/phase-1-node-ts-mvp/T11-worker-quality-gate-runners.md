> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T11-worker-quality-gate-runners.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md
> ├── T4-run-folder-layout-helpers.md
> ├── T5-container-spec-builder.md
> ├── T6-dockerexecutor-wiring.md
> ├── T7-single-task-orchestrator.md
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md                                 ← you are here
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 11: Worker — quality gate runners (TDD)

**Goal:** Each gate is a thin wrapper around the project's npm script. Returns `{ passed, output, durationMs }` and never throws — gate failures must be reported, not crashed.

**Files:**

- Create: `lib/src/gates/format.ts`
- Create: `lib/src/gates/lint.ts`
- Create: `lib/src/gates/typecheck.ts`
- Create: `lib/src/gates/test.ts`
- Create: `lib/src/gates/coverage.ts`
- Create: `lib/src/gates/security.ts`
- Create: `lib/src/gates/commitMsg.ts`
- Create: `lib/src/runGates.ts`
- Create: `lib/src/__tests__/gates/runGate.test.ts`
- Create: `lib/src/__tests__/runGates.test.ts`

- [x] **Step 1: Common gate runner — write the failing test first**

`lib/src/__tests__/gates/runGate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runShell } from '../../gates/_shell.js';

describe('runShell', () => {
  it('captures stdout and reports passed=true on exit 0', async () => {
    const r = await runShell({
      cmd: 'node',
      args: ['-e', 'console.log("hi")'],
      cwd: process.cwd(),
    });
    expect(r.passed).toBe(true);
    expect(r.output).toContain('hi');
  });
  it('reports passed=false on non-zero exit', async () => {
    const r = await runShell({ cmd: 'node', args: ['-e', 'process.exit(3)'], cwd: process.cwd() });
    expect(r.passed).toBe(false);
  });
});
```

- [x] **Step 2: Implement `lib/src/gates/_shell.ts`**

```ts
import { spawn } from 'node:child_process';

export interface ShellResult {
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
}

export async function runShell(opts: {
  cmd: string;
  args: string[];
  cwd: string;
}): Promise<ShellResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(opts.cmd, opts.args, { cwd: opts.cwd });
    let buf = '';
    proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    proc.stderr.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    proc.on('close', (code) => {
      resolve({
        passed: code === 0,
        exitCode: code ?? 1,
        output: buf,
        durationMs: Date.now() - started,
      });
    });
  });
}
```

- [x] **Step 3: Run test to verify it passes**

```bash
npm test -- runGate
```

- [x] **Step 4: Implement each gate as a thin wrapper**

`lib/src/gates/format.ts`:

```ts
import { runShell } from './_shell.js';
export const formatGate = (cwd: string) =>
  runShell({ cmd: 'npx', args: ['prettier', '--check', '.'], cwd });
```

`lib/src/gates/lint.ts`:

```ts
import { runShell } from './_shell.js';
export const lintGate = (cwd: string) =>
  runShell({ cmd: 'npx', args: ['eslint', '.', '--max-warnings=0'], cwd });
```

`lib/src/gates/typecheck.ts`:

```ts
import { runShell } from './_shell.js';
export const typecheckGate = (cwd: string) =>
  runShell({ cmd: 'npx', args: ['tsc', '--noEmit'], cwd });
```

`lib/src/gates/test.ts`:

```ts
import { runShell } from './_shell.js';
export const testGate = (cwd: string) => runShell({ cmd: 'npx', args: ['vitest', 'run'], cwd });
```

`lib/src/gates/coverage.ts`:

```ts
import { runShell } from './_shell.js';
export const coverageGate = (cwd: string) =>
  runShell({ cmd: 'npx', args: ['vitest', 'run', '--coverage'], cwd });
```

`lib/src/gates/security.ts`:

```ts
import { runShell } from './_shell.js';
export const securityGate = (cwd: string) =>
  runShell({ cmd: 'npm', args: ['audit', '--audit-level=high'], cwd });
```

`lib/src/gates/commitMsg.ts`:

```ts
import { runShell } from './_shell.js';
export const commitMsgGate = (cwd: string, baseBranch: string) =>
  runShell({
    cmd: 'npx',
    args: ['commitlint', '--from', baseBranch, '--to', 'HEAD'],
    cwd,
  });
```

- [x] **Step 5: Implement `lib/src/runGates.ts` — sequence + abort on first required failure**

`lib/src/__tests__/runGates.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { runGates } from '../runGates.js';

describe('runGates', () => {
  it('runs gates in order and stops on first required failure', async () => {
    const calls: string[] = [];
    const ok = (name: string) => async () => {
      calls.push(name);
      return { passed: true, exitCode: 0, output: '', durationMs: 1 };
    };
    const fail = (name: string) => async () => {
      calls.push(name);
      return { passed: false, exitCode: 1, output: 'boom', durationMs: 1 };
    };
    const r = await runGates({
      gates: {
        format: { mode: 'required', run: ok('format') },
        lint: { mode: 'required', run: fail('lint') },
        typecheck: { mode: 'required', run: ok('typecheck') },
      } as never,
      order: ['format', 'lint', 'typecheck'],
    });
    expect(calls).toEqual(['format', 'lint']);
    expect(r.passed).toBe(false);
    expect(r.firstFailure).toBe('lint');
  });

  it('continues when failed gate is mode=warn', async () => {
    const r = await runGates({
      gates: {
        format: {
          mode: 'warn',
          run: async () => ({ passed: false, exitCode: 1, output: '', durationMs: 1 }),
        },
        lint: {
          mode: 'required',
          run: async () => ({ passed: true, exitCode: 0, output: '', durationMs: 1 }),
        },
      } as never,
      order: ['format', 'lint'],
    });
    expect(r.passed).toBe(true);
  });
});
```

- [x] **Step 6: Implement `lib/src/runGates.ts`**

```ts
import type { ShellResult } from './gates/_shell.js';

export type GateMode = 'required' | 'warn' | 'skip';
export interface GateDef {
  mode: GateMode;
  run: () => Promise<ShellResult>;
}
export type GateName =
  | 'format'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'coverage'
  | 'security'
  | 'commitMsg';

export interface RunGatesResult {
  passed: boolean;
  firstFailure?: GateName;
  results: Record<
    GateName,
    { passed: boolean; mode: GateMode; output: string; durationMs: number }
  >;
}

export async function runGates(opts: {
  gates: Record<GateName, GateDef>;
  order: GateName[];
}): Promise<RunGatesResult> {
  const results = {} as RunGatesResult['results'];
  let firstFailure: GateName | undefined;
  for (const name of opts.order) {
    const def = opts.gates[name];
    if (def.mode === 'skip') continue;
    const r = await def.run();
    results[name] = {
      passed: r.passed,
      mode: def.mode,
      output: r.output,
      durationMs: r.durationMs,
    };
    if (!r.passed && def.mode === 'required') {
      firstFailure = name;
      break;
    }
  }
  return { passed: !firstFailure, firstFailure, results };
}
```

- [x] **Step 7: Run all gate tests**

```bash
npm test
```

Expected: all pass.

- [x] **Step 8: Commit**

```bash
git add lib/
git commit -m "feat(lib): quality gate runners and ordered preflight"
```

---
