> **Location:** `docs/architect-plan-context/plans/v1/T3-architect-driver-context.md`

# T3 — Architect driver: context priority chain, remove mergeRange

**Repo:** `arandano-worker`

**Files:**

- Modify: `lib/src/architect/architectDriver.ts`
- Modify: `lib/src/architect/__tests__/architectDriver.test.ts`

**Context:** The architect driver currently reads `ARANDANO_PLAN_MERGE_RANGE` and passes it to a `git log` prompt. Replace this with a priority chain: parse `ARANDANO_PLAN_CONTEXT_JSON` (inline, works in k8s) first, fall back to reading the file at `ARANDANO_PLAN_CONTEXT_PATH` (Docker bind-mount), fall back to a minimal prompt. Extract `resolvePlanContext` and `buildArchitectPrompt` as named exports so they can be unit-tested without triggering git/docker side effects.

---

- [ ] **Step 1: Write failing tests in `architectDriver.test.ts`**

Replace the entire file content with:

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePlanContext, buildArchitectPrompt } from '../architectDriver.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arch-driver-'));
  // Clear env vars before each test
  delete process.env['ARANDANO_PLAN_CONTEXT_JSON'];
  delete process.env['ARANDANO_PLAN_CONTEXT_PATH'];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env['ARANDANO_PLAN_CONTEXT_JSON'];
  delete process.env['ARANDANO_PLAN_CONTEXT_PATH'];
});

const FIXTURE_CONTEXT = {
  planSlug: 'smoke',
  defaultBranch: 'main',
  tasks: [
    { id: 'T1', branch: 'agent/T1-1234', prUrl: 'https://github.com/org/repo/pull/1' },
    { id: 'T2', branch: 'agent/T2-5678' },
  ],
};

describe('resolvePlanContext', () => {
  it('parses ARANDANO_PLAN_CONTEXT_JSON when set', async () => {
    process.env['ARANDANO_PLAN_CONTEXT_JSON'] = JSON.stringify(FIXTURE_CONTEXT);
    const ctx = await resolvePlanContext();
    expect(ctx?.planSlug).toBe('smoke');
    expect(ctx?.tasks).toHaveLength(2);
    expect(ctx?.tasks[0]?.branch).toBe('agent/T1-1234');
  });

  it('falls back to reading ARANDANO_PLAN_CONTEXT_PATH when JSON env var absent', async () => {
    const contextFile = join(dir, 'plan-context.json');
    await writeFile(contextFile, JSON.stringify(FIXTURE_CONTEXT));
    process.env['ARANDANO_PLAN_CONTEXT_PATH'] = contextFile;
    // Use original cwd; pass dir as the workspace root for the test
    const ctx = await resolvePlanContext(dir);
    expect(ctx?.planSlug).toBe('smoke');
    expect(ctx?.tasks).toHaveLength(2);
  });

  it('prefers ARANDANO_PLAN_CONTEXT_JSON over ARANDANO_PLAN_CONTEXT_PATH', async () => {
    process.env['ARANDANO_PLAN_CONTEXT_JSON'] = JSON.stringify({
      ...FIXTURE_CONTEXT,
      planSlug: 'from-json',
    });
    const contextFile = join(dir, 'plan-context.json');
    await writeFile(contextFile, JSON.stringify({ ...FIXTURE_CONTEXT, planSlug: 'from-file' }));
    process.env['ARANDANO_PLAN_CONTEXT_PATH'] = contextFile;
    const ctx = await resolvePlanContext(dir);
    expect(ctx?.planSlug).toBe('from-json');
  });

  it('returns null when both env vars are absent', async () => {
    const ctx = await resolvePlanContext();
    expect(ctx).toBeNull();
  });

  it('returns null (no crash) when ARANDANO_PLAN_CONTEXT_JSON is malformed', async () => {
    process.env['ARANDANO_PLAN_CONTEXT_JSON'] = '{not valid json';
    const ctx = await resolvePlanContext();
    expect(ctx).toBeNull();
  });

  it('returns null (no crash) when ARANDANO_PLAN_CONTEXT_PATH file is missing', async () => {
    process.env['ARANDANO_PLAN_CONTEXT_PATH'] = join(dir, 'does-not-exist.json');
    const ctx = await resolvePlanContext(dir);
    expect(ctx).toBeNull();
  });
});

describe('buildArchitectPrompt', () => {
  it('includes branch and pr URL lines when context has tasks', () => {
    const prompt = buildArchitectPrompt('smoke', 'main', FIXTURE_CONTEXT);
    expect(prompt).toContain('agent/T1-1234');
    expect(prompt).toContain('https://github.com/org/repo/pull/1');
    expect(prompt).toContain('agent/T2-5678');
  });

  it('shows fallback message when context is null', () => {
    const prompt = buildArchitectPrompt('smoke', 'main', null);
    expect(prompt).toContain('no task context available');
  });

  it('shows fallback message when context has empty tasks list', () => {
    const prompt = buildArchitectPrompt('smoke', 'main', { ...FIXTURE_CONTEXT, tasks: [] });
    expect(prompt).toContain('no task context available');
  });

  it('does not contain "git log" (merge range removed)', () => {
    const prompt = buildArchitectPrompt('smoke', 'main', FIXTURE_CONTEXT);
    expect(prompt).not.toContain('git log');
  });

  it('retains architect: no-op detection instruction', () => {
    const prompt = buildArchitectPrompt('smoke', 'main', null);
    expect(prompt).toContain('architect: no-op');
  });
});

// Existing test retained
describe('architectDriver no-op detection', () => {
  it('matches "architect: no-op" regardless of case and surrounding text', () => {
    const re = /architect:\s*no-op/i;
    expect(re.test('done, architect: no-op, exiting')).toBe(true);
    expect(re.test('ARCHITECT:    NO-OP')).toBe(true);
    expect(re.test('architect ok')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new tests — expect them to fail**

```
cd lib && npm test -- --reporter=verbose --testNamePattern="resolvePlanContext|buildArchitectPrompt"
```

Expected: `Cannot find module` or `is not a function` errors since the exports don't exist yet.

- [ ] **Step 3: Rewrite `architectDriver.ts`**

Replace the entire file with:

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runShell } from '../gates/_shell.js';
import { git, createBranch } from '../git.js';
import { invokeCli } from '../invokeClaudeCode.js';
import { openPr } from '../openPr.js';
import { writeJournal, writeResult } from '../writeResult.js';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env: ${k}`);
  return v;
};

export interface PlanContextTask {
  id: string;
  branch: string;
  prUrl?: string;
}

export interface PlanContext {
  planSlug: string;
  defaultBranch: string;
  tasks: PlanContextTask[];
}

/**
 * Resolves plan context using priority: inline JSON env var → file path → null.
 * @param workspaceRoot  Base directory for resolving ARANDANO_PLAN_CONTEXT_PATH.
 *                       Defaults to process.cwd().
 */
export async function resolvePlanContext(
  workspaceRoot = process.cwd(),
): Promise<PlanContext | null> {
  const inlineJson = process.env['ARANDANO_PLAN_CONTEXT_JSON'];
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson) as PlanContext;
    } catch {
      // malformed — try file
    }
  }
  const contextPath = process.env['ARANDANO_PLAN_CONTEXT_PATH'];
  if (contextPath) {
    try {
      const raw = await readFile(join(workspaceRoot, contextPath), 'utf8');
      return JSON.parse(raw) as PlanContext;
    } catch {
      // file unreadable — fall back to null
    }
  }
  return null;
}

export function buildArchitectPrompt(
  planSlug: string,
  defaultBranch: string,
  planContext: PlanContext | null,
): string {
  const taskLines = planContext?.tasks.length
    ? planContext.tasks
        .map((t) => `  - ${t.id}: branch=${t.branch}${t.prUrl ? ` pr=${t.prUrl}` : ''}`)
        .join('\n')
    : '  (no task context available — read plan files only)';

  return [
    `You are running as the architect role.`,
    `Read /opt/arandano/skills/architect/SKILL.md and apply minimal edits to docs/architecture.md.`,
    `The plan slug is "${planSlug}".`,
    `Coder tasks in this plan:`,
    taskLines,
    `For each task you may run:`,
    `  gh pr diff <prUrl>                                              (preferred)`,
    `  git fetch origin <branch> --depth=1 && git diff ${defaultBranch}...<branch>  (fallback)`,
    `Only fetch what you need. If no architectural change applies, print exactly "architect: no-op" and exit without committing.`,
    `Otherwise make ONE commit with subject ":memo: docs(arch): refresh after ${planSlug}".`,
  ].join('\n');
}

export async function architectMain(): Promise<number> {
  const workspace = process.cwd();
  const taskId = env('ARANDANO_TASK_ID');
  const runFolder = env('ARANDANO_RUN_FOLDER');
  const cli = env('ARANDANO_CLI');
  const model = env('ARANDANO_MODEL');
  const planSlug = process.env['ARANDANO_PLAN_SLUG'] ?? 'plan';
  const startedAt = new Date().toISOString();

  const cfgRaw = await runShell({
    cmd: 'cat',
    args: ['.arandano/config.yaml'],
    cwd: workspace,
  });
  const defaultBranch = /default_branch:\s*([\w./-]+)/.exec(cfgRaw.output)?.[1] ?? 'main';
  await git(['checkout', defaultBranch], workspace).catch(() => {});

  const branch = `agent/${taskId}-${Date.now()}`;
  await createBranch(workspace, branch, defaultBranch);

  const planContext = await resolvePlanContext(workspace);
  const prompt = buildArchitectPrompt(planSlug, defaultBranch, planContext);

  const cliRun = await invokeCli({
    cli,
    args: ['--print', '--dangerously-skip-permissions', '--model', model],
    prompt,
    cwd: workspace,
    env: process.env,
  });

  const noopMarker = /architect:\s*no-op/i.test(cliRun.output ?? '');
  const diff = await runShell({
    cmd: 'git',
    args: ['diff', '--name-only', defaultBranch, '--', 'docs/architecture.md'],
    cwd: workspace,
  });
  const changed = diff.output.trim().length > 0;

  if (!changed || noopMarker) {
    await writeJournal(
      join(workspace, '.arandano', 'runs', runFolder, 'journal.md'),
      [
        `architect: no-op`,
        `cli output (first 500 chars): ${(cliRun.output ?? '').slice(0, 500)}`,
      ].join('\n'),
    );
    await writeResult(join(workspace, '.arandano', 'runs', runFolder, 'result.json'), {
      task_id: taskId,
      branch,
      pr_url: null,
      passed: true,
      tdd: { mode: 'relaxed', ok: true },
      quality: {},
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      architect: 'no-op',
    } as never);
    return 0;
  }

  const bodyPath = join(workspace, '.arandano', 'runs', runFolder, 'pr-body.md');
  await writeJournal(bodyPath, `Architecture refresh for plan \`${planSlug}\`.`);
  const pr = await openPr({
    cwd: workspace,
    baseBranch: defaultBranch,
    branch,
    title: `:memo: docs(arch): refresh after ${planSlug}`,
    bodyPath,
  });

  await writeResult(join(workspace, '.arandano', 'runs', runFolder, 'result.json'), {
    task_id: taskId,
    branch,
    pr_url: pr.url ?? null,
    passed: pr.passed,
    tdd: { mode: 'relaxed', ok: true },
    quality: {},
    started_at: startedAt,
    ended_at: new Date().toISOString(),
  });
  return pr.passed ? 0 : 1;
}
```

- [ ] **Step 4: Run the new tests — expect all to pass**

```
cd lib && npm test -- --reporter=verbose --testNamePattern="resolvePlanContext|buildArchitectPrompt|no-op detection"
```

Expected: all tests pass.

- [ ] **Step 5: Run the full worker test suite — expect no regressions**

```
cd lib && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add lib/src/architect/architectDriver.ts lib/src/architect/__tests__/architectDriver.test.ts
git commit -m ":sparkles: feat(worker): resolve plan context from JSON env var or file, remove mergeRange"
```
