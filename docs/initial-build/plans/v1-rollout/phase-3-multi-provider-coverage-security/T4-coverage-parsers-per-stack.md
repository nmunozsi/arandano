> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T4-coverage-parsers-per-stack.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md                                  ← you are here
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

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
