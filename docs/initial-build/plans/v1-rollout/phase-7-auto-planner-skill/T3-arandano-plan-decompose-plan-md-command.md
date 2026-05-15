> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/T3-arandano-plan-decompose-plan-md-command.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md
> ├── T1-author-the-skill-markdown.md
> ├── T2-validate-task-tree-helper.md
> ├── T3-arandano-plan-decompose-plan-md-command.md          ← you are here
> ├── T4-inject-the-skill-into-the-worker-image.md
> └── T5-end-to-end-smoke.md
> ```

### Task 3: `arandano plan decompose <plan-md>` command (TDD)

**Goal:** Read the plan MD, generate a synthetic planner task that asks the agent to apply the skill, dispatch via the executor (Docker or k8s, matching `executor.backend`), then validate the produced tree.

**Files:**

- Create: `packages/cli/src/commands/plan/decompose.ts`
- Create: `packages/cli/src/commands/plan/__tests__/decompose.test.ts`

- [ ] **Step 1: Write the failing test (mocked executor)**

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Decompose from '../decompose.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plandec-'));
  return async () => rm(dir, { recursive: true, force: true });
});

vi.mock('@arandano/executors-docker', async () => ({
  DockerExecutor: class {
    async start() {
      return { id: 'h' };
    }
    async wait() {
      return { exitCode: 0, reason: 'ok' };
    }
    async *logs() {}
    async cancel() {}
  },
}));

describe('arandano plan decompose', () => {
  it('reports validation success when the agent produced valid tasks', async () => {
    await mkdir(join(dir, 'planning', 'plans'), { recursive: true });
    await writeFile(join(dir, 'planning', 'plans', '2026-05-08-x-plan.md'), '# x');
    // Pre-seed valid task tree (simulating the agent's output)
    await mkdir(join(dir, '.arandano', 'tasks', '2026-05-08-x'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'tasks', '2026-05-08-x', 'T1-x.md'),
      '---\nid: T1\ntitle: x\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'config.yaml'),
      `project: { name: x, default_branch: main }
executor: { backend: docker, docker: { image: i, workdir: /workspace, plugins_mount: baked-in, env_pass: [] } }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: false }
roles: { planner: { cli: claude-code, model: m }, coder: { cli: claude-code, model: m, tdd: strict } }
quality_defaults: { format: required, lint: required, typecheck: required, test: required, coverage: { min: 80, delta: any }, security: required, commit_msg: conventional, reviewer_required: false }
batching: { max_parallel: 1, timeout_minutes: 5, retry_policy: { max_attempts: 1, on: [container_error] } }
`,
    );

    const orig = process.cwd();
    process.chdir(dir);
    try {
      await Decompose.run(['planning/plans/2026-05-08-x-plan.md']);
    } finally {
      process.chdir(orig);
    }
  });
});
```

- [ ] **Step 2: Implement `decompose.ts`**

```ts
import { Args, Command } from '@oclif/core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import yaml from 'yaml';
import { validateTaskTree } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';

export default class Decompose extends Command {
  static override description = 'Use the planner agent to turn a plan MD into a tree of task MDs.';
  static override args = { planPath: Args.string({ required: true }) };

  async run(): Promise<void> {
    const { args } = await this.parse(Decompose);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'));

    const planText = await readFile(join(projectRoot, args.planPath), 'utf8');
    const slug = basename(args.planPath)
      .replace(/-plan\.md$/, '')
      .replace(/\.md$/, '');

    // Synthesize a planner task that asks the agent to apply the skill.
    const synthDir = join(projectRoot, '.arandano', 'tasks', `__decompose-${slug}`);
    await mkdir(synthDir, { recursive: true });
    const synthPath = join(synthDir, 'T1-decompose.md');
    await writeFile(
      synthPath,
      [
        '---',
        'id: T1',
        `title: Decompose plan ${slug} into task MDs`,
        'role: planner',
        'tdd: relaxed',
        'tests: []',
        'acceptance:',
        `  - "Wrote one or more T<n>-<slug>.md files under .arandano/tasks/${slug}/"`,
        '---',
        '',
        '## Context',
        '',
        `Apply the \`arandano:decomposing-plan-into-tasks\` skill to the plan at \`${args.planPath}\`. Write the resulting task MDs to \`.arandano/tasks/${slug}/\`.`,
        '',
        '## Plan content',
        '',
        planText,
      ].join('\n'),
      'utf8',
    );

    const executor = new DockerExecutor({
      image: cfg.executor.docker.image,
      host: cfg.executor.docker.host,
      projectRoot,
    });
    // Reuse runOne with our synthetic task.
    const { runOne } = await import('@arandano/core');
    const r = await runOne({ projectRoot, taskId: 'T1', executor });
    if (r.exitCode !== 0) throw new Error(`planner failed: ${r.reason}`);

    const v = await validateTaskTree({ projectRoot, planSlug: slug });
    if (!v.ok) {
      this.warn('Decomposition validation found problems:');
      for (const e of v.errors) this.warn(`  - ${e}`);
      this.exit(1);
    }
    this.log(`Decomposed plan into validated tasks under .arandano/tasks/${slug}/`);
  }
}
```

(Note: `runOne` is currently keyed on the task id, which would collide if `T1` is also used elsewhere. The synthetic dir keeps it in its own plan slug; verify `findTaskMd` glob is constrained accordingly. If not, extend `runOne` to accept an explicit plan slug — small refactor, do it now if needed.)

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- decompose
git add packages/cli/
git commit -m "feat(cli): arandano plan decompose <plan-md>"
```

---
