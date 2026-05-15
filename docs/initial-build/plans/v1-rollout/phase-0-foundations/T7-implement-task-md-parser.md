> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T7-implement-task-md-parser.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md                                    ← you are here
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 7: Implement task-md parser (TDD)

**Goal:** Parse a task markdown file (frontmatter via gray-matter + body) and validate required fields. Throws meaningful errors on missing/invalid input.

**Files:**

- Create: `packages/core/src/parsers/task-md.ts`
- Create: `packages/core/src/__tests__/task-md.test.ts`
- Modify: `packages/core/src/index.ts` (export the parser)

- [x] **Step 1: Write the failing tests**

`packages/core/src/__tests__/task-md.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTaskMd } from '../parsers/task-md.js';

describe('parseTaskMd', () => {
  it('parses valid frontmatter and body', () => {
    const input = [
      '---',
      'id: T1',
      'title: Implement foo',
      'role: coder',
      'depends_on: [T0]',
      'tdd: strict',
      '---',
      '',
      '## Context',
      'do the thing',
    ].join('\n');

    const result = parseTaskMd(input, '/abs/T1.md');

    expect(result.frontmatter.id).toBe('T1');
    expect(result.frontmatter.title).toBe('Implement foo');
    expect(result.frontmatter.role).toBe('coder');
    expect(result.frontmatter.depends_on).toEqual(['T0']);
    expect(result.frontmatter.tdd).toBe('strict');
    expect(result.body).toContain('do the thing');
    expect(result.filePath).toBe('/abs/T1.md');
  });

  it('throws when required field id is missing', () => {
    const input = '---\ntitle: x\nrole: coder\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/id/);
  });

  it('throws when required field title is missing', () => {
    const input = '---\nid: T1\nrole: coder\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/title/);
  });

  it('throws when required field role is missing', () => {
    const input = '---\nid: T1\ntitle: x\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/role/);
  });

  it('rejects invalid tdd value', () => {
    const input = '---\nid: T1\ntitle: x\nrole: coder\ntdd: chaos\n---\nbody';
    expect(() => parseTaskMd(input, '/x.md')).toThrow(/tdd/);
  });

  it('accepts minimal valid input', () => {
    const input = '---\nid: T1\ntitle: x\nrole: coder\n---\n';
    const result = parseTaskMd(input, '/x.md');
    expect(result.frontmatter.depends_on).toBeUndefined();
    expect(result.body.trim()).toBe('');
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm test -- task-md
```

Expected: tests fail with "Cannot find module" or similar (parser file does not exist yet).

- [x] **Step 3: Implement `packages/core/src/parsers/task-md.ts`**

```ts
import matter from 'gray-matter';
import { z } from 'zod';
import type { TaskFrontmatter, TaskMd } from '../types/task.js';

const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  role: z.string().min(1),
  depends_on: z.array(z.string()).optional(),
  cli: z.string().optional(),
  model: z.string().optional(),
  tdd: z.enum(['strict', 'relaxed']).optional(),
  timeout_minutes: z.number().int().positive().optional(),
  mcp: z.array(z.string()).optional(),
  tests: z.array(z.string()).optional(),
  acceptance: z.array(z.string()).optional(),
  quality: z.record(z.unknown()).optional(),
});

export function parseTaskMd(content: string, filePath: string): TaskMd {
  const { data, content: body } = matter(content);
  const parsed = TaskFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid task frontmatter in ${filePath}: ${issues}`);
  }
  return {
    frontmatter: parsed.data as TaskFrontmatter,
    body,
    filePath,
  };
}
```

- [x] **Step 4: Export the parser from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
export * from './types/index.js';
export { parseTaskMd } from './parsers/task-md.js';
```

- [x] **Step 5: Run the tests to verify they pass**

```bash
npm test -- task-md
```

Expected: all 6 tests pass.

- [x] **Step 6: Verify lint and typecheck**

```bash
npm run lint
npm run typecheck
```

Expected: clean.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/parsers/ packages/core/src/__tests__/task-md.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse and validate task markdown frontmatter"
```

---
