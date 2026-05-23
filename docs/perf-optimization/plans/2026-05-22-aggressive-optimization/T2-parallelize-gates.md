> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T2-parallelize-gates.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md
> ├── T1-instrumentation-foundation.md
> ├── T2-parallelize-gates.md                          ← you are here
> ├── T3-context-injection-and-tool-trim.md
> ├── T4-inline-role-and-standards.md
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 2: Parallelize gates with serial escape hatch

**Goal:** Run the six read-only gates (`format`, `lint`, `typecheck`, `test`, `coverage`, `security`) concurrently with `Promise.all`. `commitMsg` runs serially after the rest. Record `gates_parallel_ms` (wall) and `gates_serial_sum_ms` (sum-of-each) so the speedup factor is visible. Config flag `gates.parallel: false` reproduces the previous behavior.

**Files:**

- Modify: `arandano-worker/lib/src/runGates.ts`
- Modify: `arandano-worker/lib/src/driver.ts` — read `gates.parallel` from `config.yaml`, wire timings
- Modify: `arandano-worker/lib/src/__tests__/runGates.test.ts`
- Modify: `packages/templates/assets/config.yaml.tpl` — document the new flag

---

### Step 1 — Failing test for parallel mode

- [x] **Step 1: Add this test to `arandano-worker/lib/src/__tests__/runGates.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { runGates } from '../runGates.js';

describe('runGates parallel', () => {
  it('runs read-only gates concurrently when parallel=true and commitMsg serially last', async () => {
    const calls: string[] = [];
    const mk =
      (name: string, ms: number, pass = true) =>
      async () => {
        calls.push(`start:${name}`);
        await new Promise((r) => setTimeout(r, ms));
        calls.push(`end:${name}`);
        return { passed: pass, exitCode: pass ? 0 : 1, output: '', durationMs: ms };
      };
    const start = Date.now();
    const r = await runGates({
      parallel: true,
      order: ['format', 'lint', 'typecheck', 'test', 'coverage', 'security', 'commitMsg'],
      gates: {
        format: { mode: 'required', run: mk('format', 100) },
        lint: { mode: 'required', run: mk('lint', 100) },
        typecheck: { mode: 'required', run: mk('typecheck', 100) },
        test: { mode: 'required', run: mk('test', 100) },
        coverage: { mode: 'warn', run: mk('coverage', 100) },
        security: { mode: 'required', run: mk('security', 100) },
        commitMsg: { mode: 'required', run: mk('commitMsg', 50) },
      },
    });
    const elapsed = Date.now() - start;
    expect(r.passed).toBe(true);
    // 6 parallel × 100ms ≈ 100ms wall + 50ms commitMsg ≈ 150ms (with overhead, allow 250ms)
    expect(elapsed).toBeLessThan(250);
    // commitMsg should start AFTER all others end:
    const commitMsgStart = calls.indexOf('start:commitMsg');
    const lastReadOnlyEnd = Math.max(
      ...['format', 'lint', 'typecheck', 'test', 'coverage', 'security'].map((n) =>
        calls.indexOf(`end:${n}`),
      ),
    );
    expect(commitMsgStart).toBeGreaterThan(lastReadOnlyEnd);
  });

  it('parallel=false reproduces sequential fail-fast behavior', async () => {
    const calls: string[] = [];
    const r = await runGates({
      parallel: false,
      order: ['format', 'lint', 'typecheck'],
      gates: {
        format: {
          mode: 'required',
          run: async () => {
            calls.push('format');
            return { passed: false, exitCode: 1, output: '', durationMs: 10 };
          },
        },
        lint: {
          mode: 'required',
          run: async () => {
            calls.push('lint');
            return { passed: true, exitCode: 0, output: '', durationMs: 10 };
          },
        },
        typecheck: {
          mode: 'required',
          run: async () => {
            calls.push('typecheck');
            return { passed: true, exitCode: 0, output: '', durationMs: 10 };
          },
        },
      },
    });
    expect(r.passed).toBe(false);
    expect(r.firstFailure).toBe('format');
    // sequential fail-fast: lint and typecheck should NOT run after format failed
    expect(calls).toEqual(['format']);
  });

  it('exposes gates_parallel_ms and gates_serial_sum_ms', async () => {
    const r = await runGates({
      parallel: true,
      order: ['format', 'lint', 'commitMsg'],
      gates: {
        format: {
          mode: 'required',
          run: async () => ({ passed: true, exitCode: 0, output: '', durationMs: 50 }),
        },
        lint: {
          mode: 'required',
          run: async () => ({ passed: true, exitCode: 0, output: '', durationMs: 60 }),
        },
        commitMsg: {
          mode: 'required',
          run: async () => ({ passed: true, exitCode: 0, output: '', durationMs: 20 }),
        },
      },
    });
    expect(r.gates_serial_sum_ms).toBe(50 + 60 + 20);
    expect(r.gates_parallel_ms).toBeGreaterThan(0);
    expect(r.gates_parallel_ms).toBeLessThanOrEqual(r.gates_serial_sum_ms);
  });
});
```

- [x] **Step 2: Run — expect FAIL** (`parallel` flag does not exist; `gates_parallel_ms` not in result)

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npx vitest run src/__tests__/runGates.test.ts -t "runGates parallel"
```

### Step 3 — Rewrite `runGates`

- [x] **Step 3: Replace `runGates.ts` content**

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
  gates_parallel_ms: number;
  gates_serial_sum_ms: number;
}

const READ_ONLY: ReadonlyArray<GateName> = [
  'format',
  'lint',
  'typecheck',
  'test',
  'coverage',
  'security',
];

export async function runGates(opts: {
  gates: Record<GateName, GateDef>;
  order: GateName[];
  parallel?: boolean;
}): Promise<RunGatesResult> {
  const parallel = opts.parallel ?? true;
  const results = {} as RunGatesResult['results'];
  let firstFailure: GateName | undefined;
  const wallStart = Date.now();

  const recordResult = (name: GateName, def: GateDef, r: ShellResult): void => {
    results[name] = {
      passed: r.passed,
      mode: def.mode,
      output: r.output,
      durationMs: r.durationMs,
    };
    if (!r.passed && def.mode === 'required' && !firstFailure) firstFailure = name;
  };

  if (parallel) {
    // 1. Run all read-only gates concurrently.
    const ro = opts.order.filter((n) => READ_ONLY.includes(n) && opts.gates[n].mode !== 'skip');
    const settled = await Promise.all(
      ro.map(async (name) => {
        const def = opts.gates[name];
        return { name, def, r: await def.run() };
      }),
    );
    for (const { name, def, r } of settled) recordResult(name, def, r);

    // 2. Run commitMsg serially last (if present and not skip).
    const cm = opts.order.find((n) => n === 'commitMsg');
    if (cm && opts.gates[cm].mode !== 'skip') {
      const def = opts.gates[cm];
      const r = await def.run();
      recordResult(cm, def, r);
    }
  } else {
    // Sequential, fail-fast — pre-Phase-4 behavior.
    for (const name of opts.order) {
      const def = opts.gates[name];
      if (def.mode === 'skip') continue;
      const r = await def.run();
      recordResult(name, def, r);
      if (!r.passed && def.mode === 'required') break;
    }
  }

  const gates_parallel_ms = Date.now() - wallStart;
  const gates_serial_sum_ms = Object.values(results).reduce((a, r) => a + r.durationMs, 0);

  return { passed: !firstFailure, firstFailure, results, gates_parallel_ms, gates_serial_sum_ms };
}
```

- [x] **Step 4: Re-run tests — expect PASS**

```powershell
npx vitest run src/__tests__/runGates.test.ts
```

### Step 5 — Wire `parallel` from config into `driver.ts`

- [x] **Step 5: In `arandano-worker/lib/src/driver.ts`, read `gates.parallel` from `config.yaml`**

After the existing `const cfg = yaml.parse(cfgRaw) as { ... }` line, extend the type and read:

```ts
const cfg = yaml.parse(cfgRaw) as {
  project?: { stack?: string; default_branch?: string };
  gates?: { parallel?: boolean };
};
const gatesParallel = cfg.gates?.parallel ?? true;
```

- [x] **Step 6: Pass `parallel` into `runGates(...)`**

Find the `runGates({ order: [...], gates: { ... } })` call. Add:

```ts
const gates = await runGates({
  parallel: gatesParallel,
  order: ['format', 'lint', 'typecheck', 'test', 'coverage', 'security', 'commitMsg'],
  gates: {
    /* unchanged */
  },
});
```

- [x] **Step 7: Persist `gates_parallel_ms` and `gates_serial_sum_ms` into `timings.json`**

In the post-success block where timings are patched, after the existing T1 patches, add:

```ts
parsed['gates_parallel_ms'] = gates.gates_parallel_ms;
parsed['gates_serial_sum_ms'] = gates.gates_serial_sum_ms;
```

Mirror inside `fail(...)` if `gates` is defined.

### Step 8 — Update template config

- [x] **Step 8: Add to `packages/templates/assets/config.yaml.tpl`**

Find the existing config sections and add a new top-level block:

```yaml
# Gate execution mode. Default true runs read-only gates in parallel.
# Set to false to force the legacy sequential fail-fast behavior.
gates:
  parallel: true
```

### Step 9 — Run worker tests

- [x] **Step 9: Run all worker tests**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm test
```

All pass.

### Step 10 — Commit and push worker

- [x] **Step 10: Commit and push**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src
git commit -m ":zap: perf(gates): parallelize read-only gates with serial commitMsg + escape hatch"
git push origin main
```

- [x] **Step 11: Wait for image build**

```powershell
gh run watch $(gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1 --json databaseId --jq '.[0].databaseId') --repo nmunozsi/arandano-worker
```

### Step 12 — Build monorepo + run measurement

- [x] **Step 12: Build monorepo**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano"
npm run build
```

- [x] **Step 13: Reset state and run three-helpers plan**

Reset node-ts-toy `.arandano/state.json` (keep only AS1/AS2 completed), then:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

- [x] **Step 14: Capture bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
```

Confirm `gates_parallel_ms` < `gates_serial_sum_ms` for T4/T5/T6, with ratio ≥ 2×.

### Step 15 — Record results and commit

- [x] **Step 15: Append "+ T2 parallel gates" row** in plan.md Results table with median of T4+T5.

- [x] **Step 16: Tick T2 checkbox in plan.md**

- [x] **Step 17: Commit monorepo + results**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add packages docs
git commit -m ":zap: perf(gates): parallel gate execution measured; T2 results row appended"
```

---

**Done when:** `gates_parallel_ms` × ~2+ < `gates_serial_sum_ms`, all tests pass, Results row recorded.
