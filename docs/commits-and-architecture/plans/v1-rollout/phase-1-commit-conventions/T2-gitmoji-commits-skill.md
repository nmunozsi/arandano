> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T2-gitmoji-commits-skill.md`
>
> **Folder structure:**
>
> ```
> phase-1-commit-conventions/
> ├── T1-commitlint-rule-pack.md
> ├── T2-gitmoji-commits-skill.md   ← you are here
> └── ...
> ```

---

id: T2
title: Gitmoji-commits skill (SKILL.md + registry entry)
role: coder
tdd: relaxed
depends_on: [T1]

---

# T2 — gitmoji-commits skill

**Files:**

- Create: `packages/skills/src/skills/gitmoji-commits/SKILL.md`
- Modify: `packages/skills/src/registry.ts`
- Modify: `packages/skills/src/__tests__/registry.test.ts` (if it exists; otherwise create it)
- Modify: `packages/skills/tsup.config.ts` (only if needed to bundle the `.md` asset — verify first)

**Why:** A skill the worker reads at runtime so its CLI agent knows the exact commit format BEFORE the lint rule is enabled at the consumer side.

---

- [ ] **Step 1: Confirm the registry shape**

Read `packages/skills/src/registry.ts` and `packages/skills/src/index.ts`. The current `BUNDLED_SKILLS` is an empty `SkillMeta[]`. We will register one entry pointing at the new SKILL.md.

- [ ] **Step 2: Write the SKILL.md**

Create `packages/skills/src/skills/gitmoji-commits/SKILL.md`:

````markdown
---
name: gitmoji-commits
description: Use whenever creating a Git commit in this repository. Every commit subject MUST start with one of the 16 curated gitmoji shortcodes followed by a Conventional Commits header.
---

# Gitmoji on top of Conventional Commits

Every commit subject MUST match exactly this shape:

```
:emoji: type(scope): subject
```

Where `:emoji:` is one of the 16 curated shortcodes below, and `type` is the Conventional Commits type that pairs with it. Commitlint will reject any commit that doesn't match.

## The 16 allowed emoji shortcodes

| Shortcode               | Type     | Use for                          |
| ----------------------- | -------- | -------------------------------- |
| `:sparkles:`            | feat     | New feature for the user         |
| `:bug:`                 | fix      | User-visible bug fix             |
| `:ambulance:`           | fix      | Critical hotfix                  |
| `:lock:`                | fix      | Security-impacting fix           |
| `:zap:`                 | perf     | Performance improvement          |
| `:recycle:`             | refactor | Refactor with no behavior change |
| `:fire:`                | refactor | Remove code/files                |
| `:white_check_mark:`    | test     | Add or update tests              |
| `:memo:`                | docs     | Docs only                        |
| `:art:`                 | style    | Formatting, whitespace, no logic |
| `:rotating_light:`      | style    | Fix linter warnings              |
| `:wrench:`              | chore    | Config / tooling                 |
| `:construction_worker:` | ci       | CI changes                       |
| `:arrow_up:`            | chore    | Upgrade dependencies             |
| `:arrow_down:`          | chore    | Downgrade dependencies           |
| `:bookmark:`            | chore    | Release / version tag            |

## Worked examples

```
:sparkles: feat(cli): add --with-architect flag
:bug: fix(executors-docker): inject git safe.directory env vars
:white_check_mark: test(core): cover DAG cycle detection
:memo: docs(plans): mark Task 3 complete
:wrench: chore(deps): bump dockerode to 4.0.4
:fire: refactor(templates): remove legacy tasks/ scaffold
```

## Rules

- Use the SHORTCODE form (`:sparkles:`), not the unicode glyph (`✨`).
- The emoji and the type MUST match the table. `:sparkles: fix(…)` is rejected.
- Merge commits (subject starts with `Merge `) are exempt — commitlint's `ignores` array skips them.
- TDD commits during a task: the failing-test commit uses `:white_check_mark: test(scope): …`; the implementation commit uses `:sparkles: feat(scope): …` or `:bug: fix(scope): …` as appropriate; the refactor uses `:recycle: refactor(scope): …`.

## When in doubt

Pick the closest single category. Don't invent new types. Don't combine emojis. If the change spans categories, split it into two commits.
````

- [ ] **Step 3: Register the skill in the bundled list**

Edit `packages/skills/src/registry.ts`:

```ts
export interface SkillMeta {
  name: string;
  description: string;
}

export const BUNDLED_SKILLS: SkillMeta[] = [
  {
    name: 'gitmoji-commits',
    description:
      'Use whenever creating a Git commit. Every commit subject must start with one of the 16 curated gitmoji shortcodes paired with a Conventional Commits type.',
  },
];
```

- [ ] **Step 4: Add a registry test**

If `packages/skills/src/__tests__/` doesn't exist, create it. Add `packages/skills/src/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUNDLED_SKILLS } from '../registry.js';

describe('BUNDLED_SKILLS', () => {
  it('includes gitmoji-commits', () => {
    expect(BUNDLED_SKILLS.find((s) => s.name === 'gitmoji-commits')).toBeDefined();
  });

  it('every skill has a non-empty description', () => {
    for (const s of BUNDLED_SKILLS) expect(s.description.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm test --workspace=@arandano/skills
```

Expected: PASS.

- [ ] **Step 6: Build to confirm SKILL.md is shippable**

Read `packages/skills/tsup.config.ts`. If `.md` isn't in the bundle, the worker won't see it. The simplest fix is to copy the `SKILL.md` files into `dist/skills/<name>/` as a post-build step. Add this to `packages/skills/package.json` scripts:

```diff
   "scripts": {
-    "build": "tsup",
+    "build": "tsup && node -e \"const f=require('node:fs');const p=require('node:path');const src=p.join('src','skills');if(!f.existsSync(src))process.exit(0);for(const s of f.readdirSync(src)){const dest=p.join('dist','skills',s);f.mkdirSync(dest,{recursive:true});for(const file of f.readdirSync(p.join(src,s)))f.copyFileSync(p.join(src,s,file),p.join(dest,file));}\"",
     "test": "vitest run",
```

Then add `"skills"` to the published `files` array in the same file:

```diff
   "files": [
     "dist",
-    "README.md"
+    "README.md",
+    "src/skills"
   ],
```

Run `npm run build --workspace=@arandano/skills` and confirm `packages/skills/dist/skills/gitmoji-commits/SKILL.md` exists.

- [ ] **Step 7: Commit**

```bash
git add packages/skills
git commit -m "feat(skills): add gitmoji-commits skill"
```

## Acceptance

- `packages/skills/src/skills/gitmoji-commits/SKILL.md` exists with the curated table + 6 worked examples
- `BUNDLED_SKILLS` includes a `gitmoji-commits` entry
- `npm test --workspace=@arandano/skills` passes
- `npm run build --workspace=@arandano/skills` produces `dist/skills/gitmoji-commits/SKILL.md`
