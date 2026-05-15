> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T13-worker-driver-result-writer.md`
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
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md                                 ← you are here
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 13: Worker driver + result writer

**Goal:** Top-level orchestration inside the container: read env, prepare the branch, invoke the CLI, run gates, open a PR, write `result.json` and `journal.md`.

**Files:**

- Create: `lib/src/openPr.ts`
- Create: `lib/src/writeResult.ts`
- Create: `lib/src/driver.ts`
- Modify: `lib/src/index.ts`

- [x] **Step 1: Implement `lib/src/openPr.ts`**

```ts
import { runShell } from './gates/_shell.js';

export async function openPr(opts: {
  cwd: string;
  baseBranch: string;
  branch: string;
  title: string;
  bodyPath: string;
}): Promise<{ url?: string; passed: boolean; output: string }> {
  const push = await runShell({
    cmd: 'git',
    args: ['push', '-u', 'origin', opts.branch],
    cwd: opts.cwd,
  });
  if (!push.passed) return { passed: false, output: push.output };
  const create = await runShell({
    cmd: 'gh',
    args: [
      'pr',
      'create',
      '--base',
      opts.baseBranch,
      '--head',
      opts.branch,
      '--title',
      opts.title,
      '--body-file',
      opts.bodyPath,
    ],
    cwd: opts.cwd,
  });
  if (!create.passed) return { passed: false, output: create.output };
  const view = await runShell({
    cmd: 'gh',
    args: ['pr', 'view', '--json', 'url', '-q', '.url'],
    cwd: opts.cwd,
  });
  return { passed: true, url: view.output.trim() || undefined, output: create.output };
}
```

- [x] **Step 2: Implement `lib/src/writeResult.ts`**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ResultJson {
  task_id: string;
  branch: string;
  pr_url: string | null;
  passed: boolean;
  tdd: { mode: 'strict' | 'relaxed'; ok: boolean; reason?: string };
  quality: Record<string, { passed: boolean; output_excerpt?: string }>;
  started_at: string;
  ended_at: string;
}

export async function writeResult(path: string, value: ResultJson): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

export async function writeJournal(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}
```

- [x] **Step 3: Implement `lib/src/driver.ts`**

```ts
import { join } from 'node:path';
import { readTask } from './readTask.js';
import { commitSubjects, createBranch, currentBranch, git } from './git.js';
import { detectRedGreen } from './tdd.js';
import { invokeCli } from './invokeClaudeCode.js';
import { runGates } from './runGates.js';
import {
  formatGate,
  lintGate,
  typecheckGate,
  testGate,
  coverageGate,
  securityGate,
  commitMsgGate,
} from './gates/index.js';
import { openPr } from './openPr.js';
import { writeJournal, writeResult } from './writeResult.js';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env: ${k}`);
  return v;
};

export async function main(): Promise<number> {
  const workspace = process.cwd();
  const taskId = env('ARANDANO_TASK_ID');
  const taskMdRel = env('ARANDANO_TASK_MD');
  const cli = env('ARANDANO_CLI');
  const tdd = env('ARANDANO_TDD') as 'strict' | 'relaxed';
  const runFolder = env('ARANDANO_RUN_FOLDER');
  const quality = JSON.parse(env('ARANDANO_QUALITY_JSON')) as {
    format: 'required' | 'warn' | 'skip';
    lint: 'required' | 'warn' | 'skip';
    typecheck: 'required' | 'warn' | 'skip';
    test: 'required' | 'warn' | 'skip';
    coverage: { min: number; delta: 'nonneg' | 'any' };
    security: 'required' | 'warn' | 'skip';
    commit_msg: 'conventional' | 'freeform' | 'skip';
  };

  const startedAt = new Date().toISOString();
  const journal: string[] = [`# Run ${taskId} @ ${startedAt}`, ''];
  const log = (line: string) => {
    journal.push(line);
    console.log(line);
  };

  const task = await readTask({ workspace, taskMdRel });
  log(`task: ${task.id} — ${task.title}`);

  const baseBranch = await currentBranch(workspace);
  const branch = `agent/${task.id}-${task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)}`;
  await createBranch(workspace, branch);
  log(`branch: ${branch} (base ${baseBranch})`);

  const prompt = [
    `You are running as the ${task.role} role.`,
    `Read .arandano/roles/${task.role}.md, src/CONTEXT.md, planning/memory/coding-standards.md.`,
    `Task file: ${task.filePath}.`,
    `Use TDD (${tdd}). Make conventional commits.`,
    `Do not push or open the PR yourself — the worker will after gates pass.`,
  ].join('\n');
  const cliRun = await invokeCli({
    cli,
    args: ['--print'],
    prompt,
    cwd: workspace,
    env: process.env,
  });
  log(`cli exit=${cliRun.exitCode}`);
  if (cliRun.exitCode !== 0) {
    return await fail({
      workspace,
      runFolder,
      taskId,
      branch,
      journal,
      startedAt,
      reason: 'cli_failure',
    });
  }

  if (tdd === 'strict') {
    const subjects = await commitSubjects(workspace, baseBranch);
    const r = detectRedGreen(subjects);
    if (!r.ok) {
      log(`tdd violation: ${r.reason ?? '<none>'}`);
      return await fail({
        workspace,
        runFolder,
        taskId,
        branch,
        journal,
        startedAt,
        reason: 'tdd_violation',
      });
    }
  }

  const gates = await runGates({
    order: ['format', 'lint', 'typecheck', 'test', 'coverage', 'security', 'commitMsg'],
    gates: {
      format: { mode: quality.format, run: () => formatGate(workspace) },
      lint: { mode: quality.lint, run: () => lintGate(workspace) },
      typecheck: { mode: quality.typecheck, run: () => typecheckGate(workspace) },
      test: { mode: quality.test, run: () => testGate(workspace) },
      coverage: { mode: 'warn', run: () => coverageGate(workspace) },
      security: { mode: quality.security, run: () => securityGate(workspace) },
      commitMsg: {
        mode: quality.commit_msg === 'skip' ? 'skip' : 'required',
        run: () => commitMsgGate(workspace, baseBranch),
      },
    },
  });

  log(
    `gates passed=${gates.passed}${gates.firstFailure ? ' firstFailure=' + gates.firstFailure : ''}`,
  );
  if (!gates.passed) {
    return await fail({
      workspace,
      runFolder,
      taskId,
      branch,
      journal,
      startedAt,
      reason: 'quality_violation',
      gates,
    });
  }

  const bodyPath = join(workspace, '.arandano', 'runs', runFolder, 'pr-body.md');
  await writeJournal(bodyPath, [`Closes ${task.filePath}`, '', task.body].join('\n'));
  const pr = await openPr({
    cwd: workspace,
    baseBranch,
    branch,
    title: `[${task.id}] ${task.title}`,
    bodyPath,
  });
  log(`pr: ${pr.url ?? '<none>'} passed=${pr.passed}`);

  await writeResult(join(workspace, '.arandano', 'runs', runFolder, 'result.json'), {
    task_id: taskId,
    branch,
    pr_url: pr.url ?? null,
    passed: pr.passed,
    tdd: { mode: tdd, ok: true },
    quality: Object.fromEntries(
      Object.entries(gates.results).map(([k, v]) => [k, { passed: v.passed }]),
    ),
    started_at: startedAt,
    ended_at: new Date().toISOString(),
  });
  await writeJournal(
    join(workspace, '.arandano', 'runs', runFolder, 'journal.md'),
    journal.join('\n'),
  );
  return pr.passed ? 0 : 1;
}

async function fail(opts: {
  workspace: string;
  runFolder: string;
  taskId: string;
  branch: string;
  journal: string[];
  startedAt: string;
  reason: string;
  gates?: Awaited<ReturnType<typeof runGates>>;
}): Promise<number> {
  await writeResult(join(opts.workspace, '.arandano', 'runs', opts.runFolder, 'result.json'), {
    task_id: opts.taskId,
    branch: opts.branch,
    pr_url: null,
    passed: false,
    tdd: { mode: 'strict', ok: opts.reason !== 'tdd_violation' },
    quality: opts.gates
      ? Object.fromEntries(
          Object.entries(opts.gates.results).map(([k, v]) => [k, { passed: v.passed }]),
        )
      : {},
    started_at: opts.startedAt,
    ended_at: new Date().toISOString(),
  });
  await writeJournal(
    join(opts.workspace, '.arandano', 'runs', opts.runFolder, 'journal.md'),
    [`# Run ${opts.taskId}`, `failed: ${opts.reason}`, '', ...opts.journal].join('\n'),
  );
  return opts.reason === 'tdd_violation' ? 2 : opts.reason === 'quality_violation' ? 3 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code));
}
```

- [x] **Step 4: Add `lib/src/gates/index.ts` re-exporting all gate funcs**

```ts
export { formatGate } from './format.js';
export { lintGate } from './lint.js';
export { typecheckGate } from './typecheck.js';
export { testGate } from './test.js';
export { coverageGate } from './coverage.js';
export { securityGate } from './security.js';
export { commitMsgGate } from './commitMsg.js';
```

- [x] **Step 5: Update `lib/src/index.ts` to re-export driver**

```ts
export { main } from './driver.js';
export const WORKER_VERSION = '0.0.0';
```

- [x] **Step 6: Build and commit**

```bash
npm run build
git add lib/
git commit -m "feat(lib): worker driver — TDD enforcement, gates, PR open, result.json"
```

---
