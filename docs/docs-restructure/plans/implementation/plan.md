# Docs & Tool Restructure — Implementation Plan

> **Location:** `docs/docs-restructure/plans/implementation/plan.md`
>
> **Folder structure:**
>
> ```
> docs/docs-restructure/plans/implementation/
> ├── plan.md          ← you are here
> └── (per-task files split off later by the migration script if/when needed)
> ```

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the migration tooling, adapt the CLI and worker plumbing, and execute a one-time migration of the entire repo plus the live `node-ts-toy` example to the spec→plans→phases→tasks hierarchy described in [`spec.md`](../../spec.md).

**Architecture:** A pure-TS migration library (`packages/cli/src/migration/`) parses existing phase plans, generates the new folder + file shape, and writes Location headers. A new `arandano migrate docs` oclif command drives it with `--dry-run` / `--commit` modes. `loadPlan.ts` is extended to descend through optional `phase-*` subdirectories; the `run` command gains `--spec` and `--phase` flags. Templates are restructured. CLAUDE.md gets a new section. The plan is split into three phases: tooling, code-surface adaptation, and execution+verification.

**Tech Stack:** Node 22, TypeScript 5.5 (ESM), oclif 4, vitest, dockerode (untouched). No new runtime dependencies.

**Reference spec:** [`../../spec.md`](../../spec.md).

---

## File structure (this plan creates / modifies)

```
arandano/
├── packages/cli/src/
│   ├── migration/
│   │   ├── parsePhasePlan.ts            NEW — split a legacy phase plan into preamble + tasks
│   │   ├── locationHeader.ts            NEW — render the "Location" callout for any path
│   │   ├── writeNewStructure.ts         NEW — write spec/plan/phase/T*.md trees with headers
│   │   ├── restructureDocs.ts           NEW — top-level orchestrator
│   │   └── __tests__/
│   │       ├── parsePhasePlan.test.ts   NEW
│   │       ├── locationHeader.test.ts   NEW
│   │       ├── writeNewStructure.test.ts NEW
│   │       └── restructureDocs.test.ts  NEW
│   ├── commands/migrate/
│   │   └── docs.ts                      NEW — `arandano migrate docs` command
│   └── commands/run.ts                  MOD — accept --spec, --phase; ambiguous-slug error
├── packages/core/src/tasks/
│   ├── loadPlan.ts                      MOD — descend through phase-* subdirs
│   └── __tests__/loadPlan.test.ts       MOD — cover single- and multi-phase shapes
├── packages/templates/stacks/
│   ├── node-ts/.arandano/
│   │   ├── tasks/                       DELETED
│   │   └── specs/greet/                 NEW — example using the new structure
│   │       ├── spec.md.tpl
│   │       └── plans/initial/
│   │           ├── plan.md.tpl
│   │           └── T1-add-greet.md.tpl
│   ├── python/.arandano/                MOD — same restructure (single example task)
│   └── go/.arandano/                    MOD — same restructure
├── CLAUDE.md                            MOD — add "Docs and tool folder structure" section
├── arandano-design.md                   DELETED at repo root after migration runs
└── docs/                                MOVED — full migration into new hierarchy

arandano-examples/node-ts-toy/.arandano/
├── tasks/                               DELETED
└── specs/helpers/                       NEW — migrated three-helpers tasks
    ├── spec.md
    └── plans/three-helpers/
        ├── plan.md
        ├── T4-add-uppercase.md
        ├── T5-add-lowercase.md
        └── T6-add-titlecase.md
```

---

# Phase 1 — Build the migration tooling

## Task 1: Phase-plan parser (TDD)

**Goal:** Pure function that splits a legacy phase plan markdown into its preamble and per-task sections.

**Files:**

- Create: `packages/cli/src/migration/parsePhasePlan.ts`
- Create: `packages/cli/src/migration/__tests__/parsePhasePlan.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/migration/__tests__/parsePhasePlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePhasePlan } from '../parsePhasePlan.js';

const SAMPLE = `# arandano Phase 2 — Example Plan

**Goal:** A example.

**Architecture:** A test.

**Tech Stack:** TS.

---

## Task 1: First task

**Files:**

- Create: \`a.ts\`

- [x] **Step 1: Do thing**

\`\`\`ts
const x = 1;
\`\`\`

- [ ] **Step 2: Do other thing**

---

## Task 2: Second task (TDD)

**Files:**

- Create: \`b.ts\`

- [ ] **Step 1: Write test**

---

## Phase done — exit criteria

- [ ] Everything works
`;

describe('parsePhasePlan', () => {
  it('extracts the preamble (everything before the first Task heading)', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.preamble).toContain('# arandano Phase 2');
    expect(r.preamble).toContain('**Goal:**');
    expect(r.preamble).not.toContain('## Task 1');
  });

  it('extracts each task with number, title, and body', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks[0]?.number).toBe(1);
    expect(r.tasks[0]?.title).toBe('First task');
    expect(r.tasks[0]?.body).toContain('Step 1: Do thing');
    expect(r.tasks[1]?.number).toBe(2);
    expect(r.tasks[1]?.title).toBe('Second task (TDD)');
  });

  it('captures the exit-criteria block separately', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.exitCriteria).toContain('Everything works');
  });

  it('preserves [x] state inside task bodies', () => {
    const r = parsePhasePlan(SAMPLE);
    expect(r.tasks[0]?.body).toContain('- [x] **Step 1');
    expect(r.tasks[0]?.body).toContain('- [ ] **Step 2');
  });

  it('handles a plan with a Task 0', () => {
    const r = parsePhasePlan(
      '# x\n\nGoal\n\n---\n\n## Task 0: Setup\n\n- [ ] step\n\n---\n\n## Task 1: Real\n\n- [ ] step\n',
    );
    expect(r.tasks.map((t) => t.number)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w packages/cli -- parsePhasePlan
```

Expected: `Cannot find module '../parsePhasePlan.js'`.

- [ ] **Step 3: Implement `packages/cli/src/migration/parsePhasePlan.ts`**

```ts
export interface ParsedTask {
  number: number;
  title: string;
  body: string;
}

export interface ParsedPhasePlan {
  preamble: string;
  tasks: ParsedTask[];
  exitCriteria: string | null;
}

const TASK_HEADING = /^## Task (\d+):\s*(.+?)$/m;

export function parsePhasePlan(text: string): ParsedPhasePlan {
  const lines = text.split('\n');
  // Find indices of every `## Task N:` heading and the optional `## Phase done` heading.
  const headings: Array<
    { kind: 'task'; line: number; number: number; title: string } | { kind: 'exit'; line: number }
  > = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = TASK_HEADING.exec(line);
    if (m) {
      headings.push({
        kind: 'task',
        line: i,
        number: Number(m[1]),
        title: m[2]!.trim(),
      });
    } else if (/^## Phase done/i.test(line) || /^## Exit criteria/i.test(line)) {
      headings.push({ kind: 'exit', line: i });
    }
  }

  // Preamble = everything before the first heading.
  const firstIdx = headings[0]?.line ?? lines.length;
  const preamble = lines.slice(0, firstIdx).join('\n').trimEnd();

  // For each task heading, body = lines between it (inclusive of heading) and next heading.
  const tasks: ParsedTask[] = [];
  let exitCriteria: string | null = null;
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const next = headings[i + 1];
    const end = next ? next.line : lines.length;
    const body = lines.slice(h.line, end).join('\n').trimEnd();
    if (h.kind === 'task') {
      tasks.push({ number: h.number, title: h.title, body });
    } else {
      exitCriteria = body;
    }
  }

  return { preamble, tasks, exitCriteria };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w packages/cli -- parsePhasePlan
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/migration/parsePhasePlan.ts packages/cli/src/migration/__tests__/parsePhasePlan.test.ts
git commit -m "feat(cli): migration parser for legacy phase plans"
```

---

## Task 2: Location header generator (TDD)

**Goal:** Pure function that renders the `> **Location:** ...` callout for any file path, with a folder-tree snippet of the parent.

**Files:**

- Create: `packages/cli/src/migration/locationHeader.ts`
- Create: `packages/cli/src/migration/__tests__/locationHeader.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/migration/__tests__/locationHeader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { locationHeader } from '../locationHeader.js';

describe('locationHeader', () => {
  it('renders a header for a spec.md', () => {
    const out = locationHeader({
      fullPath: 'docs/initial-build/spec.md',
      siblings: [
        { name: 'spec.md', isCurrent: true, isDir: false },
        { name: 'plans/', isCurrent: false, isDir: true },
      ],
    });
    expect(out).toContain('> **Location:** `docs/initial-build/spec.md`');
    expect(out).toContain('> ├── spec.md          ← you are here');
    expect(out).toContain('> └── plans/');
  });

  it('marks only the current entry', () => {
    const out = locationHeader({
      fullPath: 'docs/x/plans/y/T1.md',
      siblings: [
        { name: 'plan.md', isCurrent: false, isDir: false },
        { name: 'T1.md', isCurrent: true, isDir: false },
        { name: 'T2.md', isCurrent: false, isDir: false },
      ],
    });
    expect(out).not.toContain('plan.md ← you are here');
    expect(out).toContain('T1.md            ← you are here');
    expect(out).not.toContain('T2.md ← you are here');
  });

  it('uses the parent folder name in the snippet', () => {
    const out = locationHeader({
      fullPath: 'docs/perf-instrumentation/spec.md',
      siblings: [{ name: 'spec.md', isCurrent: true, isDir: false }],
    });
    expect(out).toContain('> perf-instrumentation/');
  });

  it('ends with a single blank line after the closing fence', () => {
    const out = locationHeader({
      fullPath: 'docs/x/spec.md',
      siblings: [{ name: 'spec.md', isCurrent: true, isDir: false }],
    });
    expect(out.endsWith('\n')).toBe(true);
    expect(out.match(/\n/g)!.length).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w packages/cli -- locationHeader
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/migration/locationHeader.ts`**

````ts
import { dirname, basename } from 'node:path';

export interface SiblingEntry {
  name: string;
  isCurrent: boolean;
  isDir: boolean;
}

export interface LocationOpts {
  fullPath: string; // relative to repo root, forward slashes
  siblings: SiblingEntry[]; // entries in the parent folder, in display order
}

export function locationHeader(opts: LocationOpts): string {
  const parent = basename(dirname(opts.fullPath.replaceAll('\\', '/'))) + '/';
  // Determine the longest sibling name for column alignment of "← you are here"
  const maxLen = Math.max(...opts.siblings.map((s) => s.name.length + (s.isDir ? 1 : 0)));
  const lines: string[] = [];
  lines.push(`> **Location:** \`${opts.fullPath.replaceAll('\\', '/')}\``);
  lines.push('>');
  lines.push('> **Folder structure:**');
  lines.push('>');
  lines.push('> ```');
  lines.push(`> ${parent}`);
  opts.siblings.forEach((s, i) => {
    const last = i === opts.siblings.length - 1;
    const branch = last ? '└──' : '├──';
    const display = s.isDir ? `${s.name}/` : s.name;
    const padded = display.padEnd(maxLen + 2);
    const marker = s.isCurrent ? `${padded}← you are here` : display;
    lines.push(`> ${branch} ${marker}`);
  });
  lines.push('> ```');
  lines.push('');
  return lines.join('\n') + '\n';
}
````

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w packages/cli -- locationHeader
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/migration/locationHeader.ts packages/cli/src/migration/__tests__/locationHeader.test.ts
git commit -m "feat(cli): Location header generator for the new docs structure"
```

---

## Task 3: New-structure writer (TDD)

**Goal:** Given a `ParsedPhasePlan` and a destination directory, write the `phase.md` (or `plan.md` for collapsed single-phase plans) and one `T<N>-<slug>.md` per task, each with its Location header.

**Files:**

- Create: `packages/cli/src/migration/writeNewStructure.ts`
- Create: `packages/cli/src/migration/__tests__/writeNewStructure.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/migration/__tests__/writeNewStructure.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeNewStructure } from '../writeNewStructure.js';
import type { ParsedPhasePlan } from '../parsePhasePlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-mig-write-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const parsed: ParsedPhasePlan = {
  preamble: '# arandano Phase 2 — Example\n\n**Goal:** A test.',
  tasks: [
    { number: 1, title: 'First (TDD)', body: '## Task 1: First (TDD)\n\n- [ ] step a' },
    { number: 2, title: 'Second', body: '## Task 2: Second\n\n- [ ] step b' },
  ],
  exitCriteria: '- [ ] All works',
};

describe('writeNewStructure', () => {
  it('writes phase.md + T*.md files into the destination', async () => {
    const destFolder = 'docs/initial-build/plans/v1-rollout/phase-2-example';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'phase',
    });
    const fullDest = join(dir, destFolder);
    const entries = await readdir(fullDest);
    expect(entries.sort()).toEqual(['T1-first.md', 'T2-second.md', 'phase.md']);
    const phase = await readFile(join(fullDest, 'phase.md'), 'utf8');
    expect(phase).toContain('> **Location:** `' + destFolder + '/phase.md`');
    expect(phase).toContain('- [ ] [T1 — First (TDD)](T1-first.md)');
    expect(phase).toContain('- [ ] [T2 — Second](T2-second.md)');
    expect(phase).toContain('**Goal:** A test.');
  });

  it('writes plan.md instead of phase.md when mode=plan (single-phase collapsed)', async () => {
    const destFolder = 'docs/perf/plans/instrumentation';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'plan',
    });
    const fullDest = join(dir, destFolder);
    const entries = await readdir(fullDest);
    expect(entries.sort()).toEqual(['T1-first.md', 'T2-second.md', 'plan.md']);
  });

  it('produces T<N>-<kebab-slug>.md filenames from task titles', async () => {
    const destFolder = 'docs/x/plans/y';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed: {
        preamble: '# x',
        tasks: [{ number: 7, title: 'Add the Foo Bar (TDD)', body: '## Task 7: ...' }],
        exitCriteria: null,
      },
      mode: 'plan',
    });
    const entries = await readdir(join(dir, destFolder));
    expect(entries).toContain('T7-add-the-foo-bar.md');
  });

  it('prepends a Location header to every task file', async () => {
    const destFolder = 'docs/x/plans/y/phase-1-a';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'phase',
    });
    const t1 = await readFile(join(dir, destFolder, 'T1-first.md'), 'utf8');
    expect(t1).toMatch(/^> \*\*Location:\*\* `docs\/x\/plans\/y\/phase-1-a\/T1-first\.md`/);
    expect(t1).toContain('← you are here');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w packages/cli -- writeNewStructure
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/migration/writeNewStructure.ts`**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { locationHeader, type SiblingEntry } from './locationHeader.js';
import type { ParsedPhasePlan } from './parsePhasePlan.js';

export interface WriteOpts {
  repoRoot: string;
  destRelPath: string;
  parsed: ParsedPhasePlan;
  mode: 'plan' | 'phase'; // controls the overview filename
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // strip parens like "(TDD)"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export async function writeNewStructure(opts: WriteOpts): Promise<void> {
  const fullDest = join(opts.repoRoot, opts.destRelPath);
  await mkdir(fullDest, { recursive: true });

  const overviewName = opts.mode === 'plan' ? 'plan.md' : 'phase.md';
  const taskFiles = opts.parsed.tasks.map((t) => ({
    name: `T${t.number}-${kebab(t.title)}.md`,
    task: t,
  }));

  // Build siblings list for header generation: overview file + all task files.
  const siblingsFor = (currentName: string): SiblingEntry[] => {
    const all: SiblingEntry[] = [
      { name: overviewName, isCurrent: overviewName === currentName, isDir: false },
      ...taskFiles.map((tf) => ({
        name: tf.name,
        isCurrent: tf.name === currentName,
        isDir: false,
      })),
    ];
    return all;
  };

  // Overview file content
  const overviewHeader = locationHeader({
    fullPath: `${opts.destRelPath}/${overviewName}`,
    siblings: siblingsFor(overviewName),
  });
  const checklist = taskFiles
    .map((tf) => `- [ ] [T${tf.task.number} — ${tf.task.title}](${tf.name})`)
    .join('\n');
  const overviewBody = [
    opts.parsed.preamble,
    '',
    '## Tasks',
    '',
    checklist,
    '',
    ...(opts.parsed.exitCriteria
      ? ['---', '', '## Exit criteria', '', opts.parsed.exitCriteria]
      : []),
  ].join('\n');
  await writeFile(join(fullDest, overviewName), overviewHeader + overviewBody, 'utf8');

  // Per-task files
  for (const tf of taskFiles) {
    const header = locationHeader({
      fullPath: `${opts.destRelPath}/${tf.name}`,
      siblings: siblingsFor(tf.name),
    });
    await writeFile(join(fullDest, tf.name), header + tf.task.body + '\n', 'utf8');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w packages/cli -- writeNewStructure
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/migration/writeNewStructure.ts packages/cli/src/migration/__tests__/writeNewStructure.test.ts
git commit -m "feat(cli): writer for the new spec/plan/phase/task structure"
```

---

## Task 4: Migration orchestrator (TDD)

**Goal:** Top-level function that drives the whole restructure given a repo root: finds existing phase plans, parses them, computes destination paths, writes the new tree, moves `arandano-design.md`, moves the perf brainstorm + plan, and migrates a `.arandano/tasks/` tree (when present) to `.arandano/specs/<spec>/plans/<plan>/`.

**Files:**

- Create: `packages/cli/src/migration/restructureDocs.ts`
- Create: `packages/cli/src/migration/__tests__/restructureDocs.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/migration/__tests__/restructureDocs.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restructureMonorepoDocs, migrateUserProjectTasks } from '../restructureDocs.js';

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'arandano-mig-orch-'));
  return async () => rm(repo, { recursive: true, force: true });
});

async function seedMonorepoSample() {
  await mkdir(join(repo, 'docs', 'plans'), { recursive: true });
  await writeFile(
    join(repo, 'docs', 'plans', '2026-05-08-phase-1-node-ts-mvp.md'),
    '# arandano Phase 1\n\n**Goal:** A\n\n---\n\n## Task 1: One\n\n- [ ] step\n',
  );
  await writeFile(join(repo, 'arandano-design.md'), '# arandano Design\n\nMaster.');
}

describe('restructureMonorepoDocs', () => {
  it('moves arandano-design.md into docs/initial-build/spec.md', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const spec = await readFile(join(repo, 'docs', 'initial-build', 'spec.md'), 'utf8');
    expect(spec).toContain('# arandano Design');
    expect(spec).toMatch(/^> \*\*Location:\*\* `docs\/initial-build\/spec\.md`/);
    const stub = await readFile(join(repo, 'arandano-design.md'), 'utf8');
    expect(stub).toContain('Moved to docs/initial-build/spec.md');
  });

  it('splits each existing phase plan into a phase folder under v1-rollout', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const phaseDir = join(
      repo,
      'docs',
      'initial-build',
      'plans',
      'v1-rollout',
      'phase-1-node-ts-mvp',
    );
    const entries = await readdir(phaseDir);
    expect(entries.sort()).toEqual(['T1-one.md', 'phase.md']);
  });

  it('writes a top-level plan.md listing every phase as a checkbox', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const planMd = await readFile(
      join(repo, 'docs', 'initial-build', 'plans', 'v1-rollout', 'plan.md'),
      'utf8',
    );
    expect(planMd).toContain('- [ ] [phase-1 — node-ts-mvp](phase-1-node-ts-mvp/phase.md)');
  });
});

describe('migrateUserProjectTasks', () => {
  it('moves .arandano/tasks/<slug>/T*.md into .arandano/specs/<spec>/plans/<slug>/', async () => {
    const proj = await mkdtemp(join(tmpdir(), 'arandano-userproj-'));
    await mkdir(join(proj, '.arandano', 'tasks', '2026-05-11-three-helpers'), { recursive: true });
    await writeFile(
      join(proj, '.arandano', 'tasks', '2026-05-11-three-helpers', 'T4-add-uppercase.md'),
      '---\nid: T4\ntitle: x\nrole: coder\n---\nbody',
    );
    await migrateUserProjectTasks({ projectRoot: proj, specName: 'helpers' });
    const moved = await readFile(
      join(
        proj,
        '.arandano',
        'specs',
        'helpers',
        'plans',
        '2026-05-11-three-helpers',
        'T4-add-uppercase.md',
      ),
      'utf8',
    );
    expect(moved).toContain('id: T4');
    // Old tasks/ tree gone
    await expect(readdir(join(proj, '.arandano', 'tasks'))).rejects.toThrow();
    await rm(proj, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w packages/cli -- restructureDocs
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/migration/restructureDocs.ts`**

```ts
import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parsePhasePlan } from './parsePhasePlan.js';
import { writeNewStructure } from './writeNewStructure.js';
import { locationHeader } from './locationHeader.js';

const PHASE_PLAN_RE = /^2026-05-\d{2}-phase-(\d+)-(.+)\.md$/;
const FOUNDATIONS_RE = /^2026-05-\d{2}-arandano-foundations\.md$/;
const PERF_PLAN_RE = /^2026-05-14-phase-3-performance\.md$/;
const PERF_DESIGN_REL = 'docs/superpowers/specs/2026-05-14-phase-3-performance-design.md';

export interface RestructureOpts {
  repoRoot: string;
}

export async function restructureMonorepoDocs(opts: RestructureOpts): Promise<void> {
  const { repoRoot } = opts;

  // 1. Move arandano-design.md → docs/initial-build/spec.md
  await moveSpec(
    repoRoot,
    'arandano-design.md',
    'docs/initial-build/spec.md',
    'Moved to docs/initial-build/spec.md (2026-05-14 restructure)',
  );

  // 2. Move the perf design (if present)
  try {
    await stat(join(repoRoot, PERF_DESIGN_REL));
    await moveSpec(repoRoot, PERF_DESIGN_REL, 'docs/perf-instrumentation/spec.md', null);
  } catch {
    /* no perf design */
  }

  // 3. Walk docs/plans/ and migrate each phase plan
  let planFiles: string[] = [];
  try {
    planFiles = await readdir(join(repoRoot, 'docs', 'plans'));
  } catch {
    /* docs/plans missing — nothing to migrate */
  }
  const phaseEntries: Array<{ number: number; slug: string; file: string }> = [];
  for (const f of planFiles) {
    if (FOUNDATIONS_RE.test(f)) {
      phaseEntries.push({ number: 0, slug: 'foundations', file: f });
      continue;
    }
    const m = PHASE_PLAN_RE.exec(f);
    if (m) phaseEntries.push({ number: Number(m[1]), slug: m[2]!, file: f });
  }
  phaseEntries.sort((a, b) => a.number - b.number);

  // 4. Split each phase plan that belongs to initial-build (drop the original perf one)
  const initialBuildEntries = phaseEntries.filter((e) => !PERF_PLAN_RE.test(e.file));
  for (const entry of initialBuildEntries) {
    const text = await readFile(join(repoRoot, 'docs', 'plans', entry.file), 'utf8');
    const parsed = parsePhasePlan(text);
    const destRel = `docs/initial-build/plans/v1-rollout/phase-${entry.number}-${entry.slug}`;
    await writeNewStructure({ repoRoot, destRelPath: destRel, parsed, mode: 'phase' });
    await rm(join(repoRoot, 'docs', 'plans', entry.file));
  }

  // 5. Migrate the perf plan separately (peer spec)
  const perfPlanFile = planFiles.find((f) => PERF_PLAN_RE.test(f));
  if (perfPlanFile) {
    const text = await readFile(join(repoRoot, 'docs', 'plans', perfPlanFile), 'utf8');
    const parsed = parsePhasePlan(text);
    // Drop Task 0 (renumber) since this migration handles it.
    parsed.tasks = parsed.tasks.filter((t) => t.number !== 0);
    await writeNewStructure({
      repoRoot,
      destRelPath: 'docs/perf-instrumentation/plans/instrumentation',
      parsed,
      mode: 'plan',
    });
    await rm(join(repoRoot, 'docs', 'plans', perfPlanFile));
  }

  // 6. Write the v1-rollout plan.md (phase checklist)
  if (initialBuildEntries.length > 0) {
    await writeV1RolloutPlanMd(repoRoot, initialBuildEntries);
  }

  // 7. Remove empty docs/plans/ if everything was migrated
  try {
    const remaining = await readdir(join(repoRoot, 'docs', 'plans'));
    if (remaining.length === 0) await rm(join(repoRoot, 'docs', 'plans'), { recursive: true });
  } catch {
    /* already gone */
  }
}

async function moveSpec(
  repoRoot: string,
  fromRel: string,
  toRel: string,
  stubText: string | null,
): Promise<void> {
  const fromAbs = join(repoRoot, fromRel);
  const toAbs = join(repoRoot, toRel);
  try {
    await stat(fromAbs);
  } catch {
    return; // source missing
  }
  await mkdir(join(toAbs, '..'), { recursive: true });
  const original = await readFile(fromAbs, 'utf8');
  const header = locationHeader({
    fullPath: toRel,
    siblings: [
      { name: 'spec.md', isCurrent: true, isDir: false },
      { name: 'plans/', isCurrent: false, isDir: true },
    ],
  });
  await writeFile(toAbs, header + original, 'utf8');
  if (stubText) {
    await writeFile(fromAbs, `# ${stubText}\n`, 'utf8');
  } else {
    await rm(fromAbs);
  }
}

async function writeV1RolloutPlanMd(
  repoRoot: string,
  phases: Array<{ number: number; slug: string }>,
): Promise<void> {
  const destRel = 'docs/initial-build/plans/v1-rollout/plan.md';
  const phaseFolders = phases.map((p) => `phase-${p.number}-${p.slug}`);
  const siblings = [
    { name: 'plan.md', isCurrent: true, isDir: false },
    ...phaseFolders.map((n) => ({ name: n, isCurrent: false, isDir: true })),
  ];
  const header = locationHeader({ fullPath: destRel, siblings });
  const body = [
    '# arandano v1 Rollout — Plan',
    '',
    'Sequential build of arandano v1, broken into 10 phases. Each phase is a self-contained body of work with its own tasks.',
    '',
    '## Phases',
    '',
    ...phases.map(
      (p) => `- [ ] [phase-${p.number} — ${p.slug}](phase-${p.number}-${p.slug}/phase.md)`,
    ),
    '',
  ].join('\n');
  await mkdir(join(repoRoot, 'docs', 'initial-build', 'plans', 'v1-rollout'), {
    recursive: true,
  });
  await writeFile(join(repoRoot, destRel), header + body, 'utf8');
}

export interface UserProjectMigrationOpts {
  projectRoot: string;
  specName: string;
}

export async function migrateUserProjectTasks(opts: UserProjectMigrationOpts): Promise<void> {
  const oldRoot = join(opts.projectRoot, '.arandano', 'tasks');
  let planDirs: string[] = [];
  try {
    planDirs = await readdir(oldRoot);
  } catch {
    return; // nothing to migrate
  }
  for (const slug of planDirs) {
    const newDir = join(opts.projectRoot, '.arandano', 'specs', opts.specName, 'plans', slug);
    await mkdir(newDir, { recursive: true });
    const files = await readdir(join(oldRoot, slug));
    for (const f of files) {
      await rename(join(oldRoot, slug, f), join(newDir, f));
    }
    await rm(join(oldRoot, slug), { recursive: true });
  }
  await rm(oldRoot, { recursive: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w packages/cli -- restructureDocs
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/migration/restructureDocs.ts packages/cli/src/migration/__tests__/restructureDocs.test.ts
git commit -m "feat(cli): migration orchestrator for monorepo docs and user projects"
```

---

## Task 5: `arandano migrate docs` CLI command

**Goal:** Wrap the orchestrator in an oclif command with `--commit` (no-op default = dry-run), `--project=<path>`, and `--spec=<name>` (for user-project mode) flags. Default behavior is `--dry-run` (prints the plan without modifying any files).

**Files:**

- Create: `packages/cli/src/commands/migrate/docs.ts`
- Create: `packages/cli/src/__tests__/migrate-docs.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/__tests__/migrate-docs.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MigrateDocs from '../commands/migrate/docs.js';

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'arandano-mig-cmd-'));
  return async () => rm(repo, { recursive: true, force: true });
});

async function seed() {
  await mkdir(join(repo, 'docs', 'plans'), { recursive: true });
  await writeFile(
    join(repo, 'docs', 'plans', '2026-05-08-phase-1-node-ts-mvp.md'),
    '# x\n\nGoal\n\n---\n\n## Task 1: One\n\n- [ ] step\n',
  );
  await writeFile(join(repo, 'arandano-design.md'), '# x');
}

describe('arandano migrate docs', () => {
  it('--dry-run (default) does not modify any files', async () => {
    await seed();
    const logs: string[] = [];
    const cmd = new MigrateDocs(['--project', repo], {} as never);
    cmd.log = (m?: unknown) => logs.push(String(m));
    await cmd.run();
    // Original files still present
    await expect(readFile(join(repo, 'arandano-design.md'), 'utf8')).resolves.toContain('# x');
    await expect(readdir(join(repo, 'docs', 'initial-build'))).rejects.toThrow();
    expect(logs.join('\n')).toMatch(/dry.?run/i);
  });

  it('--commit performs the migration', async () => {
    await seed();
    const cmd = new MigrateDocs(['--project', repo, '--commit'], {} as never);
    cmd.log = () => {};
    await cmd.run();
    const entries = await readdir(join(repo, 'docs', 'initial-build', 'plans', 'v1-rollout'));
    expect(entries).toContain('phase-1-node-ts-mvp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w packages/cli -- migrate-docs
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/commands/migrate/docs.ts`**

```ts
import { Command, Flags } from '@oclif/core';
import { resolve } from 'node:path';
import {
  restructureMonorepoDocs,
  migrateUserProjectTasks,
} from '../../migration/restructureDocs.js';

export default class MigrateDocs extends Command {
  static override description =
    'Migrate docs/plans/ and .arandano/tasks/ to the new spec→plans→phases→tasks hierarchy.';

  static override flags = {
    project: Flags.string({
      description: 'project root (defaults to current dir)',
      default: process.cwd(),
    }),
    commit: Flags.boolean({
      description: 'actually perform the migration (without this, runs as a dry-run)',
      default: false,
    }),
    spec: Flags.string({
      description: 'spec name to use when migrating a user project (.arandano/tasks/)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateDocs);
    const root = resolve(flags.project);

    if (!flags.commit) {
      this.log(`dry-run mode — would migrate ${root}`);
      this.log('  - monorepo: docs/plans/*.md → docs/initial-build/plans/v1-rollout/phase-*/');
      this.log('  - user project: .arandano/tasks/*/T*.md → .arandano/specs/<spec>/plans/*/T*.md');
      this.log('Re-run with --commit to perform the migration.');
      return;
    }

    await restructureMonorepoDocs({ repoRoot: root });
    if (flags.spec) {
      await migrateUserProjectTasks({ projectRoot: root, specName: flags.spec });
    }
    this.log(`migration complete at ${root}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w packages/cli -- migrate-docs
```

Expected: 2 passing.

- [ ] **Step 5: Build to regenerate the oclif manifest**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/migrate/docs.ts packages/cli/src/__tests__/migrate-docs.test.ts packages/cli/oclif.manifest.json
git commit -m "feat(cli): arandano migrate docs command (dry-run by default)"
```

---

# Phase 2 — Adapt the code surfaces

## Task 6: Update `loadPlan` to descend through phase subdirs (TDD)

**Goal:** Resolve a plan from a slug across `.arandano/specs/**/plans/<slug>/`, and read tasks either directly from the plan folder (single-phase) OR from `phase-*/` subfolders (multi-phase).

**Files:**

- Modify: `packages/core/src/tasks/loadPlan.ts`
- Modify: `packages/core/src/tasks/__tests__/loadPlan.test.ts`

- [ ] **Step 1: Read the current implementation**

```bash
cat packages/core/src/tasks/loadPlan.ts
```

Note: it currently reads `<projectRoot>/.arandano/tasks/<planSlug>/` with a regex `/^T\d+-.*\.md$/`.

- [ ] **Step 2: Extend the test file**

Append to `packages/core/src/tasks/__tests__/loadPlan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan } from '../loadPlan.js';

describe('loadPlan — new structure', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'arandano-loadplan-new-'));
    return async () => rm(dir, { recursive: true, force: true });
  });

  it('loads tasks from .arandano/specs/<spec>/plans/<plan>/ (single-phase collapsed)', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'helpers', 'plans', 'three-helpers');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'plan.md'), '# plan\n');
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(join(planDir, 'T2-bar.md'), '---\nid: T2\ntitle: bar\nrole: coder\n---\n');
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'three-helpers' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
  });

  it('loads tasks from phase-*/ subfolders (multi-phase plan)', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'helpers', 'plans', 'multi');
    await mkdir(join(planDir, 'phase-1-a'), { recursive: true });
    await mkdir(join(planDir, 'phase-2-b'), { recursive: true });
    await writeFile(join(planDir, 'plan.md'), '# plan\n');
    await writeFile(join(planDir, 'phase-1-a', 'phase.md'), '# phase\n');
    await writeFile(
      join(planDir, 'phase-1-a', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await writeFile(join(planDir, 'phase-2-b', 'phase.md'), '# phase\n');
    await writeFile(
      join(planDir, 'phase-2-b', 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'multi' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
  });

  it('throws when planSlug is ambiguous across specs', async () => {
    await mkdir(join(dir, '.arandano', 'specs', 'A', 'plans', 'common'), { recursive: true });
    await mkdir(join(dir, '.arandano', 'specs', 'B', 'plans', 'common'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'specs', 'A', 'plans', 'common', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'specs', 'B', 'plans', 'common', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await expect(loadPlan({ projectRoot: dir, planSlug: 'common' })).rejects.toThrow(/ambiguous/);
  });

  it('takes a specName option to disambiguate', async () => {
    await mkdir(join(dir, '.arandano', 'specs', 'A', 'plans', 'common'), { recursive: true });
    await mkdir(join(dir, '.arandano', 'specs', 'B', 'plans', 'common'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'specs', 'A', 'plans', 'common', 'T1-a.md'),
      '---\nid: T1\ntitle: a\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'specs', 'B', 'plans', 'common', 'T1-b.md'),
      '---\nid: T1\ntitle: b\nrole: coder\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'common', specName: 'A' });
    expect(tasks.map((t) => t.frontmatter.title)).toEqual(['a']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -w packages/core -- loadPlan
```

Expected: the old tests still pass; the new ones fail because the lookup is the wrong shape.

- [ ] **Step 4: Rewrite `packages/core/src/tasks/loadPlan.ts`**

```ts
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTaskMd } from '../parsers/task-md.js';
import type { TaskMd } from '../types/task.js';

export interface LoadPlanOpts {
  projectRoot: string;
  planSlug: string;
  specName?: string;
}

const TASK_FILE_RE = /^T\d+-.*\.md$/;
const PHASE_DIR_RE = /^phase-\d+-/;

export async function loadPlan(opts: LoadPlanOpts): Promise<TaskMd[]> {
  const planDirs = await locatePlanDirs(opts);
  if (planDirs.length === 0) {
    throw new Error(`plan not found: ${opts.planSlug}`);
  }
  if (planDirs.length > 1) {
    throw new Error(
      `plan slug "${opts.planSlug}" is ambiguous across specs: ${planDirs
        .map((d) => d)
        .join(', ')} — pass specName to disambiguate`,
    );
  }
  const planDir = planDirs[0]!;
  return readTasksFromPlanDir(planDir);
}

async function locatePlanDirs(opts: LoadPlanOpts): Promise<string[]> {
  const root = opts.projectRoot;
  // New layout: .arandano/specs/<spec>/plans/<slug>/
  const specsRoot = join(root, '.arandano', 'specs');
  const results: string[] = [];
  let specs: string[] = [];
  try {
    specs = await readdir(specsRoot);
  } catch {
    specs = [];
  }
  for (const spec of specs) {
    if (opts.specName && spec !== opts.specName) continue;
    const candidate = join(specsRoot, spec, 'plans', opts.planSlug);
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) results.push(candidate);
    } catch {
      /* not present in this spec */
    }
  }
  return results;
}

async function readTasksFromPlanDir(planDir: string): Promise<TaskMd[]> {
  const out: TaskMd[] = [];
  const entries = await readdir(planDir, { withFileTypes: true });
  // First, collect direct T*.md files (single-phase / collapsed)
  for (const e of entries) {
    if (e.isFile() && TASK_FILE_RE.test(e.name)) {
      const fp = join(planDir, e.name);
      out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
    }
  }
  // Then, descend into phase-* subdirectories
  for (const e of entries) {
    if (e.isDirectory() && PHASE_DIR_RE.test(e.name)) {
      const phaseDir = join(planDir, e.name);
      const subs = await readdir(phaseDir);
      for (const f of subs) {
        if (TASK_FILE_RE.test(f)) {
          const fp = join(phaseDir, f);
          out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -w packages/core -- loadPlan
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tasks/loadPlan.ts packages/core/src/tasks/__tests__/loadPlan.test.ts
git commit -m "feat(core): loadPlan handles spec/plans/<plan>/[phase-*/]T*.md shapes with ambiguity errors"
```

---

## Task 7: Add `--spec` / `--phase` flags to `run` (TDD)

**Goal:** Surface the new disambiguation options on the user-facing `arandano run` command.

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/__tests__/run.test.ts`

- [ ] **Step 1: Update the run test file**

Append to `packages/cli/src/__tests__/run.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

describe('arandano run — new flags', () => {
  it('accepts --spec and forwards it to the Orchestrator', async () => {
    // This test is a sanity check on flag parsing. The orchestrator integration
    // tests cover the actual lookup.
    const Run = (await import('../commands/run.js')).default;
    expect(Run.flags.spec).toBeDefined();
    expect(Run.flags.phase).toBeDefined();
  });
});
```

(The existing run tests already cover the dispatch path. Phase-3-style end-to-end coverage is verified manually in Phase 3 below.)

- [ ] **Step 2: Update `packages/cli/src/commands/run.ts`**

Add `spec` and `phase` to the flags object and forward them. Replace the existing flag block with:

```ts
static override flags = {
  plan: Flags.string({ description: 'plan slug under .arandano/specs/<spec>/plans/<slug>/' }),
  spec: Flags.string({ description: 'spec name (disambiguates ambiguous plan slugs)' }),
  phase: Flags.string({ description: 'phase slug to run a single phase of a multi-phase plan' }),
};
```

And update the `if (flags.plan) { ... }` branch so `Orchestrator` receives `specName`:

```ts
if (flags.plan) {
  const o = new Orchestrator({
    projectRoot,
    planSlug: flags.plan,
    executor,
    specName: flags.spec,
    phaseSlug: flags.phase,
  });
  const summary = await o.run();
  this.log(
    `completed=${summary.completed.length} failed=${summary.failed.length} skipped=${summary.skipped.length}`,
  );
  if (summary.failed.length > 0) process.exit(1);
  return;
}
```

- [ ] **Step 3: Update `Orchestrator` to accept `specName` and `phaseSlug`**

Edit `packages/core/src/orchestrator/orchestrator.ts`:

```ts
export interface OrchestratorOpts {
  projectRoot: string;
  planSlug: string;
  executor: Executor;
  specName?: string;
  phaseSlug?: string;
}
```

Forward them to `loadPlan`:

```ts
const tasks = await loadPlan({
  projectRoot,
  planSlug,
  specName: this.opts.specName,
});
```

For `phaseSlug` filtering, after loading: if `phaseSlug` is set, drop tasks whose file path doesn't include `/phase-{phaseSlug}/`. Add a `taskMdPath` filter:

```ts
const filtered = this.opts.phaseSlug
  ? tasks.filter(
      (t) =>
        t.filePath.includes(`/phase-${this.opts.phaseSlug}/`) ||
        t.filePath.includes(`\\phase-${this.opts.phaseSlug}\\`),
    )
  : tasks;
```

Use `filtered` everywhere after that. (The `TaskMd.filePath` field is set by `parseTaskMd` and contains the absolute path.)

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all green.

- [ ] **Step 5: Build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/__tests__/run.test.ts packages/core/src/orchestrator/orchestrator.ts packages/cli/oclif.manifest.json
git commit -m "feat(cli): --spec and --phase flags on arandano run"
```

---

## Task 8: Restructure templates to the new layout

**Goal:** Scaffolded projects should land in the new structure immediately. Move the template's example tasks from `tasks/` to `specs/greet/plans/initial/`.

**Files:**

- Move: `packages/templates/stacks/node-ts/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md.tpl` → `packages/templates/stacks/node-ts/.arandano/specs/greet/plans/initial/T1-add-greet.md.tpl`
- Create: `packages/templates/stacks/node-ts/.arandano/specs/greet/spec.md.tpl`
- Create: `packages/templates/stacks/node-ts/.arandano/specs/greet/plans/initial/plan.md.tpl`
- Same restructure for `python` and `go` stacks
- Verify (no change needed): `packages/templates/src/scaffold.ts`

- [ ] **Step 1: Move the existing task template (node-ts)**

```bash
mkdir -p packages/templates/stacks/node-ts/.arandano/specs/greet/plans/initial
git mv packages/templates/stacks/node-ts/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md.tpl packages/templates/stacks/node-ts/.arandano/specs/greet/plans/initial/T1-add-greet.md.tpl
rm -rf packages/templates/stacks/node-ts/.arandano/tasks
```

- [ ] **Step 2: Create `spec.md.tpl` for the node-ts greet example**

`packages/templates/stacks/node-ts/.arandano/specs/greet/spec.md.tpl`:

````markdown
> **Location:** `.arandano/specs/greet/spec.md`
>
> **Folder structure:**
>
> ```
> .arandano/specs/greet/
> ├── spec.md          ← you are here
> └── plans/
>     └── initial/
> ```

# {{name}} — greet helper

A toy "hello world" example to verify the scaffold and worker run end-to-end.

## Goal

Ship one tiny module that says hello, with a passing test and a green CI run.

## Acceptance

- `src/greet.ts` exports `greet(name: string): string`.
- `src/greet.test.ts` covers it with at least one test.
- All quality gates pass.
````

- [ ] **Step 3: Create `plan.md.tpl` for the node-ts greet example**

`packages/templates/stacks/node-ts/.arandano/specs/greet/plans/initial/plan.md.tpl`:

````markdown
> **Location:** `.arandano/specs/greet/plans/initial/plan.md`
>
> **Folder structure:**
>
> ```
> .arandano/specs/greet/plans/initial/
> ├── plan.md            ← you are here
> └── T1-add-greet.md
> ```

# {{name}} greet — initial plan

Single-phase plan with one task.

## Tasks

- [ ] [T1 — add greet helper](T1-add-greet.md)
````

- [ ] **Step 4: Apply the same shape to the python stack**

```bash
mkdir -p packages/templates/stacks/python/.arandano/specs/greet/plans/initial
git mv packages/templates/stacks/python/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md.tpl packages/templates/stacks/python/.arandano/specs/greet/plans/initial/T1-add-greet.md.tpl 2>/dev/null || true
rm -rf packages/templates/stacks/python/.arandano/tasks
```

Then copy and adapt the spec.md.tpl and plan.md.tpl files from node-ts. The content is identical except for stack-specific phrasing in `spec.md.tpl` (`src/greet.py` instead of `src/greet.ts`, etc.). Replace `src/greet.ts` with `src/greet.py` and `src/greet.test.ts` with `tests/test_greet.py` in the python spec.md.tpl.

- [ ] **Step 5: Apply the same shape to the go stack**

```bash
mkdir -p packages/templates/stacks/go/.arandano/specs/greet/plans/initial
git mv packages/templates/stacks/go/.arandano/tasks/2026-05-08-add-greet/T1-add-greet.md.tpl packages/templates/stacks/go/.arandano/specs/greet/plans/initial/T1-add-greet.md.tpl 2>/dev/null || true
rm -rf packages/templates/stacks/go/.arandano/tasks
```

Adapt spec.md.tpl for Go: `greet.go` and `greet_test.go`.

- [ ] **Step 6: Verify the scaffold writer**

The scaffold writer at `packages/templates/src/scaffold.ts` walks the stack tree recursively and writes every `.tpl` (with substitutions) and copies other files as-is. Walk through with the current implementation in mind — it should pick up the new paths automatically because it's recursive.

```bash
cat packages/templates/src/scaffold.ts | head -50
```

Expected: a recursive walk. No code changes required.

- [ ] **Step 7: Run scaffold tests if any exist**

```bash
npm test -w packages/templates
```

Expected: green (or no tests).

- [ ] **Step 8: Commit**

```bash
git add packages/templates/stacks/
git commit -m "feat(templates): scaffold the new specs/<spec>/plans/<plan>/ layout"
```

---

## Task 9: Update `CLAUDE.md` with the docs structure section

**Goal:** Document the convention so future Claude sessions follow it without re-deriving it.

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Append the new section before "Lessons learned from e2e debugging"**

Open `CLAUDE.md` and add this section after "## Key invariants — do not break these" and before "## Lessons learned from e2e debugging":

````markdown
## Docs and tool folder structure

All design + planning + agentic work follows this hierarchy:

**Spec → Plans → Phases → Tasks**

| Level | File             | Owns                                 |
| ----- | ---------------- | ------------------------------------ |
| Spec  | `spec.md`        | Design / vision / non-goals / risks  |
| Plan  | `plan.md`        | Plan overview + phase checklist      |
| Phase | `phase.md`       | Phase overview + task checklist      |
| Task  | `T<N>-<slug>.md` | Task body with step-level checkboxes |

### Locations

- **Monorepo (this repo):** `docs/<spec-name>/spec.md`, `docs/<spec-name>/plans/<plan-slug>/...`
- **User projects** (`.arandano/` from `arandano init`): `.arandano/specs/<spec-name>/spec.md`, `.arandano/specs/<spec-name>/plans/<plan-slug>/...`

### Single-phase plan collapse

When a plan has exactly one phase, the directory for that phase is skipped — tasks live directly under the plan folder, and `plan.md` owns the task checklist instead of a separate `phase.md`.

### Location header (required on every MD)

Every `spec.md`, `plan.md`, `phase.md`, and `T*.md` starts with a callout that shows the file's path and its parent folder, with `← you are here` next to the current file:

> **Location:** `<full path from repo root>`
>
> **Folder structure:**
>
> ```
> <parent folder>/
> ├── <sibling file>
> ├── <current file>   ← you are here
> └── <sibling folder>/
> ```

Generate it with the `packages/cli/src/migration/locationHeader.ts` helper, or follow the template above by hand.

### Progress tracking

- `plan.md` owns the phase-level checklist (or task checklist for single-phase plans).
- `phase.md` owns the task-level checklist.
- Each `T<N>-*.md` owns its own step-level `- [ ]` checkboxes.

When executing a task, an agent has read+write access to all files in the spec/plan/phase folder and is expected to update progress checkboxes as it goes. Cross-task updates (editing a later task to incorporate findings from the current one) are first-class.

### CLI

- `arandano run --plan=<slug>` resolves an unambiguous slug across all specs.
- `arandano run --spec=<name> --plan=<slug>` disambiguates.
- `arandano run --plan=<slug> --phase=<phase-slug>` runs a single phase of a multi-phase plan.
- `arandano migrate docs --commit` migrates legacy `docs/plans/` and `.arandano/tasks/` trees to this hierarchy.
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document spec/plan/phase/task hierarchy in CLAUDE.md"
```

---

# Phase 3 — Execute and verify

## Task 10: Run the monorepo migration

**Goal:** Apply the migration to this repo and review every output before committing.

- [ ] **Step 1: Make sure the working tree is clean**

```bash
git status
```

Expected: nothing to commit. If you have uncommitted changes from earlier tasks, finish their commits first.

- [ ] **Step 2: Dry-run the migration and review the output**

```bash
node packages/cli/dist/bin.js migrate docs
```

Expected: a list of moves and writes, no file system changes. Verify the planned destination paths look right.

- [ ] **Step 3: Run the real migration**

```bash
node packages/cli/dist/bin.js migrate docs --commit
```

Expected: `docs/plans/` empty (or removed), `docs/initial-build/` populated with `spec.md` + `plans/v1-rollout/phase-*/`, `docs/perf-instrumentation/` populated.

- [ ] **Step 4: Inspect the output**

```bash
ls docs/
ls docs/initial-build/plans/v1-rollout/
cat docs/initial-build/plans/v1-rollout/plan.md | head -30
cat docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/phase.md | head -20
cat docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T1-*.md | head -20
```

Confirm: Location headers present on every file, task counts match the originals, exit-criteria preserved.

- [ ] **Step 5: Sanity-check that every original `### Task N` mapped to exactly one `T*.md`**

For each phase folder:

```bash
for p in docs/initial-build/plans/v1-rollout/phase-*/; do
  echo "== $p =="
  ls "$p"
done
```

Cross-reference with the previous task counts from the original phase plans (e.g., Phase 2 had T0-T12).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(docs): migrate monorepo to spec/plans/phases/tasks hierarchy"
```

---

## Task 11: Run the migration on `node-ts-toy`

**Goal:** Apply the same migration to the live user project.

- [ ] **Step 1: Dry-run from the node-ts-toy directory**

```bash
cd ../arandano-examples/node-ts-toy
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" migrate docs --spec=helpers
```

Expected: a printout of what would move from `.arandano/tasks/2026-05-11-three-helpers/` to `.arandano/specs/helpers/plans/2026-05-11-three-helpers/`.

- [ ] **Step 2: Real run**

```bash
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" migrate docs --spec=helpers --commit
```

Expected: `.arandano/tasks/` removed, `.arandano/specs/helpers/plans/2026-05-11-three-helpers/T4-...md, T5-..., T6-...` present.

- [ ] **Step 3: Inspect**

```bash
ls .arandano/specs/helpers/plans/2026-05-11-three-helpers/
```

Expected: T4-add-uppercase.md, T5-add-lowercase.md, T6-add-titlecase.md.

- [ ] **Step 4: Commit in node-ts-toy**

```bash
git add -A
git commit -m "chore: migrate to .arandano/specs/<spec>/plans/<plan>/ structure"
```

---

## Task 12: Delete the `arandano-design.md` stub

**Goal:** After one commit cycle has passed (i.e., the new spec is in git and reviewed), remove the old redirect stub.

**Files:**

- Delete: `arandano-design.md` at the monorepo root

- [ ] **Step 1: Verify the stub is just the redirect line**

```bash
cat arandano-design.md
```

Expected: a single line like `# Moved to docs/initial-build/spec.md (2026-05-14 restructure)`.

- [ ] **Step 2: Delete and commit**

```bash
rm arandano-design.md
git add -A
git commit -m "chore: remove arandano-design.md redirect stub"
```

---

## Task 13: End-to-end verification on `node-ts-toy`

**Goal:** Confirm the worker still finds tasks at the new path by running a single task through the full pipeline.

- [ ] **Step 1: Reset `node-ts-toy/.arandano/state.json` to a clean baseline**

In `arandano-examples/node-ts-toy/.arandano/state.json`, keep only T1 (the prior completed task) and remove any T4/T5/T6 entries (since this is just a smoke test, we don't need to re-run them all).

```json
{
  "tasks": {
    "T1": {
      "retry_count": 0,
      "status": "completed",
      "started_at": "2026-05-13T02:00:20.721Z",
      "finished_at": "2026-05-13T02:11:37.307Z"
    }
  }
}
```

- [ ] **Step 2: Re-run a single task (T4) to verify the new path resolves**

From PowerShell with `ANTHROPIC_API_KEY` and `GH_TOKEN` set:

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run T4
```

Expected: T4 runs through the container (~10-12 min), opens or updates a PR. The key thing being verified is that the worker reads the task MD from the new path — exact completion or PR number is secondary.

- [ ] **Step 3: Inspect the run folder**

```powershell
ls .arandano/runs/
```

A new run folder should exist for this T4 run, with `result.json` showing `passed: true`.

- [ ] **Step 4: Reset the state and commit the verification**

If T4 wrote anything to state.json or runs/, reset/commit as appropriate:

```bash
git add .arandano/state.json .arandano/runs/
git commit -m "chore: verify worker reads from .arandano/specs/<spec>/plans/<plan>/T*.md"
```

---

# Phase done — exit criteria

- [ ] `arandano-design.md` deleted at repo root; `docs/initial-build/spec.md` has its content + Location header
- [ ] All 10 monorepo phase plans split into `docs/initial-build/plans/v1-rollout/phase-N-<slug>/` with `phase.md` + per-task `T*.md` files
- [ ] `docs/perf-instrumentation/spec.md` (was the brainstorm output) and `docs/perf-instrumentation/plans/instrumentation/{plan.md, T*.md}` exist; Task 0 (renumber) dropped
- [ ] Every `spec.md`, `plan.md`, `phase.md`, `T*.md` written by the migration starts with a Location header
- [ ] `CLAUDE.md` documents the hierarchy, naming, single-phase collapse, Location header, progress-tracking, and CLI flags
- [ ] `packages/templates/stacks/<stack>/.arandano/` template uses `specs/greet/plans/initial/{spec.md, plan.md, T*.md}` for node-ts, python, and go
- [ ] `packages/core/src/tasks/loadPlan.ts` handles single- and multi-phase shapes; both old and new test cases pass
- [ ] `arandano run --plan=<slug>` resolves an unambiguous slug; ambiguous slugs error with a clear message; `--spec` and `--phase` flags accepted
- [ ] `arandano migrate docs` ships as a CLI command with `--commit` (real run) and dry-run as default
- [ ] `arandano-examples/node-ts-toy/.arandano/tasks/` migrated to `.arandano/specs/helpers/plans/2026-05-11-three-helpers/T*.md`
- [ ] All existing tests pass; one e2e single-task run on node-ts-toy confirms the worker reads the new path
- [ ] The Phase 3 perf plan now lives at `docs/perf-instrumentation/plans/instrumentation/` and can be executed without further edits
