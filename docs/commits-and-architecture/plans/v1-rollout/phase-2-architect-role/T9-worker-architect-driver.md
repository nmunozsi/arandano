> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T9-worker-architect-driver.md`

---

id: T9
title: Worker driver — architect branch
role: coder
tdd: relaxed
depends_on: [T3]

---

# T9 — Worker driver gains an architect branch

**Files (in `arandano-worker` repo):**

- Create: `arandano-worker/lib/src/architect/architectDriver.ts`
- Create: `arandano-worker/lib/src/architect/__tests__/architectDriver.test.ts`
- Modify: `arandano-worker/lib/src/driver.ts` (delegate to architectDriver when the role is architect)
- Modify: `arandano-worker/lib/src/skills/architect/SKILL.md` (copy from monorepo)
- Modify: `arandano-worker/lib/package.json` build entry points

**Why:** Today `driver.ts` has a `reviewer` branch (line 25–28) that delegates to `reviewerDriver`. We add a parallel `architect` branch that:

1. Reads `docs/architecture.md` + the plan files + the merge range.
2. Invokes the CLI agent with the architect skill in scope.
3. Checks whether the file changed.
4. If yes — commits with `:memo: docs(arch): refresh after <plan-slug>` and opens a PR.
5. If no — prints `architect: no-op`, exits 0, opens no PR.

---

- [ ] **Step 1: Vendor the SKILL.md into the worker repo**

```bash
mkdir -p arandano-worker/lib/src/skills/architect
cp arandano/packages/skills/src/skills/architect/SKILL.md \
   arandano-worker/lib/src/skills/architect/SKILL.md
cp arandano/packages/skills/src/skills/architect/template.md.tpl \
   arandano-worker/lib/src/skills/architect/template.md.tpl
```

- [ ] **Step 2: Author `architectDriver.ts`**

Create `arandano-worker/lib/src/architect/architectDriver.ts`:

```ts
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

export async function architectMain(): Promise<number> {
  const workspace = process.cwd();
  const taskId = env('ARANDANO_TASK_ID');
  const runFolder = env('ARANDANO_RUN_FOLDER');
  const cli = env('ARANDANO_CLI');
  const model = env('ARANDANO_MODEL');
  const planSlug = process.env['ARANDANO_PLAN_SLUG'] ?? 'plan';
  const mergeRange = process.env['ARANDANO_PLAN_MERGE_RANGE'] ?? '';
  const startedAt = new Date().toISOString();

  // Reset to the default branch then create the architect branch.
  const cfgRaw = await runShell({
    cmd: 'cat',
    args: ['.arandano/config.yaml'],
    cwd: workspace,
  });
  const defaultBranch = /default_branch:\s*([\w./-]+)/.exec(cfgRaw.output)?.[1] ?? 'main';
  await git(['checkout', defaultBranch], workspace).catch(() => {});

  const branch = `agent/${taskId}-${Date.now()}`;
  await createBranch(workspace, branch, defaultBranch);

  const prompt = [
    `You are running as the architect role.`,
    `Read /opt/arandano/skills/architect/SKILL.md and apply minimal edits to docs/architecture.md.`,
    `The plan slug is "${planSlug}". The merged commit range is "${mergeRange}".`,
    `Inspect: docs/architecture.md (current), the plan files under docs/ or .arandano/specs/, and "git log ${mergeRange}".`,
    `If no architectural change applies, print exactly "architect: no-op" and exit without committing.`,
    `Otherwise make ONE commit with subject ":memo: docs(arch): refresh after ${planSlug}".`,
  ].join('\n');

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
  await writeJournal(
    bodyPath,
    [`Architecture refresh for plan \`${planSlug}\`.`, '', `Merge range: \`${mergeRange}\``].join(
      '\n',
    ),
  );
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

- [ ] **Step 3: Wire the architect branch in driver.ts**

Edit `arandano-worker/lib/src/driver.ts`. Right under the existing reviewer branch (lines 25–28), add:

```diff
   const roleMd = process.env['ARANDANO_ROLE_MD'] ?? '';
   if (roleMd.endsWith('reviewer.md')) {
     const { reviewerMain } = await import('./reviewer/reviewerDriver.js');
     return reviewerMain();
   }
+  if (roleMd.endsWith('architect.md') || process.env['ARANDANO_TASK_ID'] === 'T-architect') {
+    const { architectMain } = await import('./architect/architectDriver.js');
+    return architectMain();
+  }
```

- [ ] **Step 4: Add the new entry point to the build**

Edit `arandano-worker/lib/package.json`. The current `build` is:

```
tsup src/index.ts src/driver.ts src/start.ts --format esm --dts --target node22 --clean
```

It already bundles via the driver entry — but the architect driver is dynamically imported, so we need tsup to include it. Update `build` to:

```
tsup src/index.ts src/driver.ts src/start.ts src/architect/architectDriver.ts src/reviewer/reviewerDriver.ts --format esm --dts --target node22 --clean
```

(Note: the existing reviewer driver was likely picked up automatically via the dynamic import in driver.ts. Explicit entries make the bundle output predictable.)

- [ ] **Step 5: Add a smoke test for architectDriver's no-op path**

Create `arandano-worker/lib/src/architect/__tests__/architectDriver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

// architectDriver is heavy on side effects (git, child_process, network). A pure
// unit test isolates the no-op detection only.
describe('architectDriver no-op detection', () => {
  it('matches "architect: no-op" regardless of case and surrounding text', () => {
    const re = /architect:\s*no-op/i;
    expect(re.test('done, architect: no-op, exiting')).toBe(true);
    expect(re.test('ARCHITECT:    NO-OP')).toBe(true);
    expect(re.test('architect ok')).toBe(false);
  });
});
```

- [ ] **Step 6: Run worker tests + build**

```bash
cd arandano-worker/lib
npm test
npm run build
```

Both should exit 0. The `dist/` directory should now contain `architectDriver.js`.

- [ ] **Step 7: Update the worker Dockerfile to bake the architect skill**

Edit `arandano-worker/Dockerfile`. Where T3 added the gitmoji-commits skill, add a sibling line for architect:

```dockerfile
COPY lib/src/skills/architect/SKILL.md /opt/arandano/skills/architect/SKILL.md
COPY lib/src/skills/architect/template.md.tpl /opt/arandano/skills/architect/template.md.tpl
```

- [ ] **Step 8: Commit in the worker repo**

```bash
cd arandano-worker
git add lib/src/architect lib/src/skills/architect lib/src/driver.ts lib/package.json Dockerfile
git commit -m ":sparkles: feat(worker): architect driver + skill bundling"
git push origin main
```

The push triggers `release.yml` — verified in T10.

## Acceptance

- `architectDriver.ts` exists and is exported by the worker `dist/`
- `driver.ts` delegates to it when `ARANDANO_TASK_ID=T-architect` or role MD ends with `architect.md`
- Dockerfile bakes the architect SKILL.md and template into `/opt/arandano/skills/architect/`
- The no-op smoke test passes
