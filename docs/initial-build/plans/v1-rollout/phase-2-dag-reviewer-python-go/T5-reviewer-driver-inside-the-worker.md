> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T5-reviewer-driver-inside-the-worker.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md                           ← you are here
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 5: Reviewer driver inside the worker

**Goal:** When `ARANDANO_ROLE=reviewer`, the worker reads the linked PR, fetches the diff, runs the checklist, and posts review comments.

**Files (in `arandano-worker`):**

- Create: `lib/src/reviewer/reviewChecklist.ts`
- Create: `lib/src/reviewer/reviewerDriver.ts`
- Create: `lib/src/reviewer/__tests__/reviewChecklist.test.ts`
- Modify: `lib/src/driver.ts` (branch on role)

- [x] **Step 1: Write the failing test for the checklist** ✅

`lib/src/reviewer/__tests__/reviewChecklist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChecklist } from '../reviewChecklist.js';

describe('applyChecklist', () => {
  it('flags a diff that adds a hardcoded secret', () => {
    const r = applyChecklist({
      diff: '+ const apiKey = "sk-1234567890abcdef1234"',
      contextRules: ['no hardcoded secrets'],
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings[0]?.severity).toBe('blocker');
  });

  it('passes a clean diff', () => {
    const r = applyChecklist({
      diff: '+ const greet = (name: string) => `hello, ${name}`;',
      contextRules: [],
    });
    expect(r.findings).toEqual([]);
  });
});
```

- [x] **Step 2: Implement `lib/src/reviewer/reviewChecklist.ts`** ✅

```ts
export interface Finding {
  severity: 'info' | 'warn' | 'blocker';
  message: string;
  excerpt?: string;
}

export interface ChecklistResult {
  findings: Finding[];
  decision: 'approve' | 'request_changes';
}

const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{16,}/, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z\-_]{30,}/];

export function applyChecklist(opts: { diff: string; contextRules: string[] }): ChecklistResult {
  const findings: Finding[] = [];
  for (const re of SECRET_PATTERNS) {
    const m = re.exec(opts.diff);
    if (m) {
      findings.push({
        severity: 'blocker',
        message: 'possible hardcoded secret in diff',
        excerpt: m[0],
      });
    }
  }
  // Add more rules over time. Phase 2 ships secret-detection only.
  return {
    findings,
    decision: findings.some((f) => f.severity === 'blocker') ? 'request_changes' : 'approve',
  };
}
```

- [x] **Step 3: Implement `lib/src/reviewer/reviewerDriver.ts`** ✅

```ts
import { runShell } from '../gates/_shell.js';
import { applyChecklist } from './reviewChecklist.js';
import { writeJournal, writeResult } from '../writeResult.js';
import { join } from 'node:path';

export async function reviewerMain(): Promise<number> {
  const workspace = process.cwd();
  const taskId = process.env.ARANDANO_TASK_ID!;
  const sourceTaskId = taskId.replace(/-review$/, '');
  const runFolder = process.env.ARANDANO_RUN_FOLDER!;

  // Find the PR for the source task.
  const prList = await runShell({
    cmd: 'gh',
    args: [
      'pr',
      'list',
      '--head',
      `agent/${sourceTaskId}-`,
      '--state',
      'open',
      '--json',
      'number,url,headRefName,body',
      '--limit',
      '1',
      '--search',
      sourceTaskId,
    ],
    cwd: workspace,
  });
  if (!prList.passed) return 1;
  const found = JSON.parse(prList.output || '[]') as Array<{ number: number; url: string }>;
  const pr = found[0];
  if (!pr) {
    await writeJournal(
      join(workspace, '.arandano', 'runs', runFolder, 'review.md'),
      `No PR found for ${sourceTaskId}`,
    );
    return 1;
  }

  const diff = await runShell({
    cmd: 'gh',
    args: ['pr', 'diff', String(pr.number)],
    cwd: workspace,
  });
  const result = applyChecklist({ diff: diff.output, contextRules: [] });

  const body = [
    `Review of #${pr.number} (${sourceTaskId}):`,
    '',
    ...(result.findings.length === 0
      ? ['No blockers found. Approving.']
      : result.findings.map(
          (f) => `- **${f.severity}** ${f.message}${f.excerpt ? ' — `' + f.excerpt + '`' : ''}`,
        )),
  ].join('\n');

  const action = result.decision === 'approve' ? '--approve' : '--request-changes';
  await runShell({
    cmd: 'gh',
    args: ['pr', 'review', String(pr.number), action, '--body', body],
    cwd: workspace,
  });

  await writeJournal(join(workspace, '.arandano', 'runs', runFolder, 'review.md'), body);
  await writeResult(join(workspace, '.arandano', 'runs', runFolder, 'result.json'), {
    task_id: taskId,
    branch: '',
    pr_url: pr.url,
    passed: result.decision === 'approve',
    tdd: { mode: 'relaxed', ok: true },
    quality: {},
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  });
  return result.decision === 'approve' ? 0 : 1;
}
```

- [x] **Step 4: Branch on role inside `lib/src/driver.ts`** ✅

At the top of `main()` add:

```ts
const role = process.env.ARANDANO_ROLE_MD ?? '';
if (role.endsWith('reviewer.md')) {
  const { reviewerMain } = await import('./reviewer/reviewerDriver.js');
  return await reviewerMain();
}
```

- [x] **Step 5: Build, run tests, commit** ✅ f3bd427 (13/13 pass)

```bash
npm run build
npm test
git add lib/
git commit -m "feat(lib): reviewer driver with secret-detection checklist"
```

---
