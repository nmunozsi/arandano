> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T6-stack-template-flip.md`

---

id: T6
title: Flip stack templates to the new commitlint pack
role: coder
tdd: relaxed
depends_on: [T5]

---

# T6 — Flip all stack templates

**Files:**

- Modify: `packages/templates/stacks/node-ts/.commitlintrc.cjs.tpl` (rename from `.cjs` to `.cjs.tpl` if not already, then edit)
- Modify: `packages/templates/stacks/python/.commitlintrc.cjs.tpl` (same)
- Modify: `packages/templates/stacks/go/.commitlintrc.cjs.tpl` (same)
- Modify: `packages/templates/src/__tests__/scaffold.test.ts` (extend to assert the new content reaches scaffolded projects)

**Why:** Every project scaffolded by `arandano init` from this point on uses the new pack. The pack is shipped as part of `@arandano/templates`, so a relative reference works after scaffolding.

---

- [ ] **Step 1: Inspect the current shape**

```bash
ls packages/templates/stacks/node-ts/.commitlintrc*
ls packages/templates/stacks/python/.commitlintrc*
ls packages/templates/stacks/go/.commitlintrc*
```

The files are currently named `.commitlintrc.cjs` (no `.tpl`) because they don't contain `{{tokens}}`. We will keep them as-is (no rename needed — they're plain copies, not templated).

- [ ] **Step 2: Rewrite each template**

Replace the contents of all three `.commitlintrc.cjs` files (under `node-ts`, `python`, `go`) with:

```cjs
'use strict';

// The rule pack ships inside @arandano/templates. After `arandano init` scaffolds the
// project, the pack is resolvable via the path below relative to the project root.
// If you install @arandano/templates as a dev dependency you can switch to:
//     require('@arandano/templates/commitlint-rules')
module.exports = {
  ...require('@arandano/templates/commitlint-rules'),
};
```

Then add `@arandano/templates` to the scaffolded project's expected devDependencies. Edit each stack's `package.json.tpl` (or equivalent) — for `node-ts`:

```bash
ls packages/templates/stacks/node-ts/package.json*
```

If a `package.json.tpl` exists, add `@arandano/templates` under `devDependencies`. If not, the project's `package.json` ships preconfigured; check what the current file looks like and append:

```json
{
  "devDependencies": {
    "@arandano/templates": "*"
  }
}
```

> **Note:** if a `package.json.tpl` doesn't exist in a given stack, that stack's scaffolded project is expected to install `@arandano/templates` manually. Document this in `CLAUDE.md` (handled in T7).

- [ ] **Step 3: Write/extend the scaffold test**

Read `packages/templates/src/__tests__/scaffold.test.ts`. Add (or extend) a test that scaffolds the `node-ts` stack into a temp dir and asserts:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold.js';

describe('scaffold .commitlintrc.cjs', () => {
  it('node-ts ships the new gitmoji pack', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'arandano-tpl-'));
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'demo',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'a@b',
    });
    const txt = await readFile(join(dir, '.commitlintrc.cjs'), 'utf8');
    expect(txt).toContain('@arandano/templates/commitlint-rules');
  });
});
```

- [ ] **Step 4: Run the test (should fail because templates not yet updated to the new content)**

```bash
npm test --workspace=@arandano/templates
```

Expected: FAIL until Step 2's edits are saved. (If you've already saved Step 2's edits, it will PASS — that's fine.)

- [ ] **Step 5: Run all tests across the monorepo**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/templates/stacks/*/.commitlintrc.cjs \
        packages/templates/stacks/*/package.json* \
        packages/templates/src/__tests__/scaffold.test.ts
git commit -m ":sparkles: feat(templates): scaffold projects with @arandano/templates/commitlint-rules"
```

## Acceptance

- All three stack templates' `.commitlintrc.cjs` reference `@arandano/templates/commitlint-rules`
- Scaffold test asserts the reference is present in the scaffolded project
- `npm test` passes
