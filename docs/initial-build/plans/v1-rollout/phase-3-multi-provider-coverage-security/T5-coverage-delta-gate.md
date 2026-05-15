> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T5-coverage-delta-gate.md`
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
> ├── T5-coverage-delta-gate.md                                         ← you are here
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

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
