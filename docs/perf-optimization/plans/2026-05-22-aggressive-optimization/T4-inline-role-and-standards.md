> **Location:** `docs/perf-optimization/plans/2026-05-22-aggressive-optimization/T4-inline-role-and-standards.md`
>
> **Folder structure:**
>
> ```
> 2026-05-22-aggressive-optimization/
> ├── plan.md
> ├── T0-prerequisites.md
> ├── T1-instrumentation-foundation.md
> ├── T2-parallelize-gates.md
> ├── T3-context-injection-and-tool-trim.md
> ├── T4-inline-role-and-standards.md                  ← you are here
> ├── T5-gitnexus-skip-when-fresh.md
> ├── T6-container-reuse-pool.md
> ├── T7-prompt-caching-audit.md
> └── T8-summary-report.md
> ```

## Task 4: Inline role + standards content in worker prompt

**Goal:** Stop telling Claude to "Read .arandano/roles/coder.md, src/CONTEXT.md, planning/memory/coding-standards.md, /opt/arandano/skills/gitmoji-commits/SKILL.md." Instead, the worker reads these files server-side and prepends their content (capped at 8KB total) to the prompt. Saves the 4 file-read tool calls Claude would otherwise make.

**Files:**

- Modify: `arandano-worker/lib/src/driver.ts` — add `buildInlinedContent(workdir, role)`; update prompt construction.
- Modify: `arandano-worker/lib/src/__tests__/driver.test.ts` — tests for `buildInlinedContent`.

---

### Step 1 — Failing test for `buildInlinedContent`

- [ ] **Step 1: Add this test to `arandano-worker/lib/src/__tests__/driver.test.ts`**

```ts
import { buildInlinedContent } from '../driver.js';

describe('buildInlinedContent', () => {
  it('inlines role, CONTEXT, coding-standards, and gitmoji SKILL content', async () => {
    const dir = join(tmpdir(), `test-inlined-${Date.now()}`);
    await mkdir(join(dir, '.arandano/roles'), { recursive: true });
    await mkdir(join(dir, 'src'), { recursive: true });
    await mkdir(join(dir, 'planning/memory'), { recursive: true });
    await writeFile(join(dir, '.arandano/roles/coder.md'), 'ROLE_CODER', 'utf8');
    await writeFile(join(dir, 'src/CONTEXT.md'), 'CTX', 'utf8');
    await writeFile(join(dir, 'planning/memory/coding-standards.md'), 'STD', 'utf8');

    // Simulate the baked-in skill path by overriding via env var
    const skillDir = join(tmpdir(), `skill-${Date.now()}`);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'GITMOJI', 'utf8');

    const out = await buildInlinedContent(dir, 'coder', join(skillDir, 'SKILL.md'));
    expect(out).toContain('ROLE_CODER');
    expect(out).toContain('CTX');
    expect(out).toContain('STD');
    expect(out).toContain('GITMOJI');
    expect(out).toContain('<inlined>');
    expect(out).toContain('</inlined>');
  });

  it('caps total content at 8KB and adds truncation marker', async () => {
    const dir = join(tmpdir(), `test-inlined-cap-${Date.now()}`);
    await mkdir(join(dir, '.arandano/roles'), { recursive: true });
    await writeFile(join(dir, '.arandano/roles/coder.md'), 'X'.repeat(10000), 'utf8');
    const out = await buildInlinedContent(dir, 'coder', '/nonexistent');
    expect(out.length).toBeLessThanOrEqual(8 * 1024 + 256); // 256 byte slack for wrappers/truncation marker
    expect(out).toContain('[truncated');
  });

  it('silently skips missing files and returns empty string when all missing', async () => {
    const out = await buildInlinedContent('/nonexistent/dir', 'coder', '/nonexistent/SKILL.md');
    expect(out).toBe('');
  });
});
```

- [ ] **Step 2: Run — expect FAIL (function not exported)**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npx vitest run src/__tests__/driver.test.ts -t "buildInlinedContent"
```

### Step 3 — Implement `buildInlinedContent` in `driver.ts`

- [ ] **Step 3: Add the function near `buildContextBlock`**

```ts
const INLINE_CAP_BYTES = 8 * 1024;

export async function buildInlinedContent(
  workdir: string,
  role: string,
  gitmojiSkillPath: string,
): Promise<string> {
  const candidates: Array<{ label: string; absPath: string }> = [
    {
      label: `.arandano/roles/${role}.md`,
      absPath: join(workdir, '.arandano', 'roles', `${role}.md`),
    },
    { label: 'src/CONTEXT.md', absPath: join(workdir, 'src', 'CONTEXT.md') },
    {
      label: 'planning/memory/coding-standards.md',
      absPath: join(workdir, 'planning', 'memory', 'coding-standards.md'),
    },
    { label: 'gitmoji-commits SKILL.md', absPath: gitmojiSkillPath },
  ];

  const blocks: string[] = [];
  let used = 0;
  for (const { label, absPath } of candidates) {
    try {
      const content = await readFile(absPath, 'utf8');
      const header = `\`\`\`${label}\n`;
      const footer = `\n\`\`\``;
      const overhead = Buffer.byteLength(header + footer, 'utf8');
      const remaining = INLINE_CAP_BYTES - used - overhead;
      if (remaining <= 0) {
        blocks.push(`[truncated: budget exhausted before ${label}]`);
        break;
      }
      const trimmed =
        Buffer.byteLength(content, 'utf8') > remaining
          ? content.slice(0, remaining) + `\n[truncated, see ${label} for full]`
          : content;
      blocks.push(header + trimmed + footer);
      used += Buffer.byteLength(blocks[blocks.length - 1]!, 'utf8');
    } catch {
      // file missing — skip silently
    }
  }
  if (blocks.length === 0) return '';
  return `<inlined>\n${blocks.join('\n\n')}\n</inlined>\n\n`;
}
```

- [ ] **Step 4: Re-run — expect PASS**

```powershell
npx vitest run src/__tests__/driver.test.ts -t "buildInlinedContent"
```

### Step 5 — Wire it into the prompt and remove the "Read these files" instructions

- [ ] **Step 5: In `arandano-worker/lib/src/driver.ts`, update prompt construction**

Find:

```ts
const promptBody = [
  `You are running as the ${task.role} role.`,
  `Read .arandano/roles/${task.role}.md, src/CONTEXT.md, planning/memory/coding-standards.md.`,
  `Read the SKILL.md at /opt/arandano/skills/gitmoji-commits/SKILL.md and follow its commit format on every commit you produce.`,
  `Task file: ${task.filePath}.`,
  `Use TDD (${tdd}). Every commit MUST follow the gitmoji-commits skill format.`,
  `Do not push or open the PR yourself — the worker will after gates pass.`,
].join('\n');
```

Replace with:

```ts
const inlinedBlock = await buildInlinedContent(
  workspace,
  task.role,
  '/opt/arandano/skills/gitmoji-commits/SKILL.md',
);

const promptBody = [
  `You are running as the ${task.role} role.`,
  `Project standards, role description, and gitmoji commit format are inlined above (see <inlined>...</inlined>).`,
  `Task file: ${task.filePath}.`,
  `Use TDD (${tdd}). Every commit MUST follow the gitmoji-commits format already inlined.`,
  `Do not push or open the PR yourself — the worker will after gates pass.`,
].join('\n');
const prompt = inlinedBlock + contextBlock + promptBody;
```

(Note: `contextBlock` already exists from the `ARANDANO_INJECT_CONTEXT` feature; keep it after `inlinedBlock`.)

### Step 6 — Build and test

- [ ] **Step 6: Build and run all tests**

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker\lib"
npm run build
npm test
```

### Step 7 — Commit, push, wait for image

- [ ] **Step 7: Commit + push worker**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src
git commit -m ":zap: perf(driver): inline role + standards + gitmoji skill into prompt (8KB cap)"
git push origin main
```

- [ ] **Step 8: Wait for image build**

```powershell
gh run watch $(gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1 --json databaseId --jq '.[0].databaseId') --repo nmunozsi/arandano-worker
```

### Step 9 — Run measurement

- [ ] **Step 9: Reset state and run plan**

Reset node-ts-toy `.arandano/state.json` (keep AS1/AS2):

```powershell
cd "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

- [ ] **Step 10: Capture bench output**

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" bench --by-tool
```

Confirm `cli_tool_calls` for `Read` drops by ≥ 4 per task (the 4 instruction reads).

### Step 11 — Record results and commit

- [ ] **Step 11: Append "+ T4 inline content" row** in plan.md Results table.

- [ ] **Step 12: Tick T4 checkbox in plan.md**

- [ ] **Step 13: Commit results**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/perf-optimization/plans/2026-05-22-aggressive-optimization/plan.md
git commit -m ":memo: docs(plans): T4 inline-content results row"
```

---

**Done when:** `cli_tool_calls` Read count drops by ≥ 4 per task, `worker_cli_ms` decreases vs T3, Results row recorded.
