> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T9-arandano-memory-promote-and-arandano-issue-command.md`
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
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md          ← you are here
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 9: `arandano memory promote` and `arandano issue` commands

**Goal:** Two thin commands over the markdown-as-database substrate. `memory promote` extracts a snippet from a run's `journal.md` and appends to `planning/memory/coding-standards.md`. `issue open|close|list` manages `planning/issues/`.

**Files:**

- Create: `packages/cli/src/commands/memory/promote.ts`
- Create: `packages/cli/src/commands/issue/{open,close,list}.ts`
- Tests in `__tests__/`

- [x] **Step 1: Implement `memory/promote.ts`**

````ts
import { Args, Command, Flags } from '@oclif/core';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class MemoryPromote extends Command {
  static override description =
    'Append a finding from a run journal to planning/memory/coding-standards.md';
  static override args = {
    runFolder: Args.string({ required: true, description: 'e.g. 2026-05-08T19-30Z-T1' }),
  };
  static override flags = {
    section: Flags.string({ required: true }),
    rule: Flags.string({ required: true }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(MemoryPromote);
    const root = process.cwd();
    const journal = await readFile(
      join(root, '.arandano', 'runs', args.runFolder, 'journal.md'),
      'utf8',
    );
    const today = new Date().toISOString().slice(0, 10);
    const block = [
      ``,
      `### ${flags.section} (${today}, from run ${args.runFolder})`,
      ``,
      `**Rule:** ${flags.rule}`,
      ``,
      `**Source excerpt:**`,
      ``,
      '```',
      journal.slice(0, 800),
      '```',
      ``,
    ].join('\n');
    await appendFile(join(root, 'planning', 'memory', 'coding-standards.md'), block, 'utf8');
    this.log(`appended to planning/memory/coding-standards.md`);
  }
}
````

- [x] **Step 2: Implement `issue/open.ts`**

```ts
import { Args, Command, Flags } from '@oclif/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class IssueOpen extends Command {
  static override description = 'Create a new issue MD under planning/issues/';
  static override args = { slug: Args.string({ required: true }) };
  static override flags = {
    title: Flags.string({ required: true }),
    labels: Flags.string({ description: 'comma-separated' }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueOpen);
    const today = new Date().toISOString().slice(0, 10);
    const fname = `${today}-${args.slug}.md`;
    const path = join(process.cwd(), 'planning', 'issues', fname);
    await mkdir(join(process.cwd(), 'planning', 'issues'), { recursive: true });
    const labels =
      flags.labels
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    await writeFile(
      path,
      [
        `---`,
        `title: ${flags.title}`,
        `status: open`,
        `labels: [${labels.join(', ')}]`,
        `---`,
        ``,
        `## What`,
        ``,
        `## Repro`,
        ``,
        `## Expected`,
        ``,
      ].join('\n'),
      'utf8',
    );
    this.log(`opened ${path}`);
  }
}
```

- [x] **Step 3: Implement `issue/close.ts` and `issue/list.ts`** — analogous, flipping `status: open` → `closed`, listing all issue files with their `status` and `labels`.

- [x] **Step 4: Tests**

For `issue open`, run the command in a tmp dir, assert the file exists with the right frontmatter.
For `memory promote`, seed a run journal, run the command, assert the standards file was appended to.

- [x] **Step 5: Commit** (cf0745a)

---
