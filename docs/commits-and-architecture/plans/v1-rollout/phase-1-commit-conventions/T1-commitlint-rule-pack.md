> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T1-commitlint-rule-pack.md`
>
> **Folder structure:**
>
> ```
> phase-1-commit-conventions/
> ├── phase.md
> ├── T1-commitlint-rule-pack.md   ← you are here
> ├── T2-gitmoji-commits-skill.md
> └── ...
> ```

---

id: T1
title: Custom commitlint rule pack (gitmoji + conventional)
role: coder
tdd: strict

---

# T1 — Custom commitlint rule pack

**Files:**

- Create: `packages/templates/commitlint-rules/index.cjs` (new directory + file)
- Create: `packages/templates/commitlint-rules/rules.cjs`
- Create: `packages/templates/commitlint-rules/__tests__/rules.test.cjs`
- Create: `packages/templates/commitlint-rules/package.json` (CommonJS, no build, version-pinned to `@commitlint/config-conventional`)
- Modify: `packages/templates/package.json` (add the new sub-path to the published `files` array)

**Why:** A single, vendored rule pack used by the monorepo root, every stack template, and the worker. CommonJS (`.cjs`) so it loads cleanly under `@commitlint/cli` without ESM gymnastics.

---

- [ ] **Step 1: Author the rule definitions**

Create `packages/templates/commitlint-rules/rules.cjs`:

```cjs
'use strict';

// Curated 16-emoji mapping. Each shortcode → exactly one Conventional Commits type.
const MAPPING = Object.freeze({
  ':sparkles:': 'feat',
  ':bug:': 'fix',
  ':ambulance:': 'fix',
  ':lock:': 'fix',
  ':zap:': 'perf',
  ':recycle:': 'refactor',
  ':fire:': 'refactor',
  ':white_check_mark:': 'test',
  ':memo:': 'docs',
  ':art:': 'style',
  ':rotating_light:': 'style',
  ':wrench:': 'chore',
  ':construction_worker:': 'ci',
  ':arrow_up:': 'chore',
  ':arrow_down:': 'chore',
  ':bookmark:': 'chore',
});

const LEADING_RE = /^(:[a-z0-9_+\-]+:)\s+([a-z]+)(?:\(([^)]+)\))?:\s+\S/;

function gitmojiLeading(parsed) {
  const subject = (parsed.header || '').trim();
  const m = LEADING_RE.exec(subject);
  if (!m) {
    return [
      false,
      'commit subject must match `:emoji: type(scope): subject`. See docs/commits-and-architecture/spec.md §4 for the curated emoji list.',
    ];
  }
  const emoji = m[1];
  if (!Object.prototype.hasOwnProperty.call(MAPPING, emoji)) {
    return [
      false,
      `emoji ${emoji} is not in the curated set. Allowed: ${Object.keys(MAPPING).join(', ')}.`,
    ];
  }
  return [true];
}

function gitmojiTypeMatch(parsed) {
  const subject = (parsed.header || '').trim();
  const m = LEADING_RE.exec(subject);
  if (!m) return [true]; // leave the failure to gitmoji-leading
  const emoji = m[1];
  const type = m[2];
  const expected = MAPPING[emoji];
  if (!expected) return [true]; // again, gitmoji-leading owns this
  if (expected !== type) {
    return [false, `emoji ${emoji} must pair with type \`${expected}\`, got \`${type}\`.`];
  }
  return [true];
}

module.exports = {
  MAPPING,
  rules: {
    'gitmoji-leading': gitmojiLeading,
    'gitmoji-type-match': gitmojiTypeMatch,
  },
};
```

- [ ] **Step 2: Author the rule pack entry point**

Create `packages/templates/commitlint-rules/index.cjs`:

```cjs
'use strict';
const local = require('./rules.cjs');

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: local.rules,
    },
  ],
  rules: {
    'gitmoji-leading': [2, 'always'],
    'gitmoji-type-match': [2, 'always'],
  },
  ignores: [(message) => /^Merge /i.test(message)],
};
```

- [ ] **Step 3: Author the package.json for the rule pack**

Create `packages/templates/commitlint-rules/package.json`:

```json
{
  "name": "@arandano/commitlint-rules",
  "version": "0.0.0",
  "private": true,
  "main": "index.cjs",
  "files": ["index.cjs", "rules.cjs"],
  "peerDependencies": {
    "@commitlint/config-conventional": "^19.0.0"
  }
}
```

- [ ] **Step 4: Write failing tests**

Create `packages/templates/commitlint-rules/__tests__/rules.test.cjs`:

```cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules } = require('../rules.cjs');

const parse = (header) => ({ header });

test('gitmoji-leading: accepts curated shortcode + conventional shape', () => {
  const [ok] = rules['gitmoji-leading'](parse(':sparkles: feat(cli): add flag'));
  assert.equal(ok, true);
});

test('gitmoji-leading: rejects missing emoji', () => {
  const [ok, msg] = rules['gitmoji-leading'](parse('feat(cli): add flag'));
  assert.equal(ok, false);
  assert.match(msg, /must match/);
});

test('gitmoji-leading: rejects uncurated emoji', () => {
  const [ok, msg] = rules['gitmoji-leading'](parse(':rocket: feat(cli): add flag'));
  assert.equal(ok, false);
  assert.match(msg, /not in the curated set/);
});

test('gitmoji-type-match: accepts matching pair', () => {
  const [ok] = rules['gitmoji-type-match'](parse(':bug: fix(core): correct off-by-one'));
  assert.equal(ok, true);
});

test('gitmoji-type-match: rejects wrong pair', () => {
  const [ok, msg] = rules['gitmoji-type-match'](parse(':sparkles: fix(core): nope'));
  assert.equal(ok, false);
  assert.match(msg, /must pair with type `feat`/);
});

test('gitmoji-type-match: skips when leading rule already failed', () => {
  const [ok] = rules['gitmoji-type-match'](parse('feat(cli): no emoji'));
  assert.equal(ok, true);
});

test('curated mapping: every aliased fix-type emoji maps to fix', () => {
  const { MAPPING } = require('../rules.cjs');
  for (const e of [':bug:', ':ambulance:', ':lock:']) assert.equal(MAPPING[e], 'fix');
});
```

- [ ] **Step 5: Run tests to verify they fail (no impl yet)**

```bash
node --test packages/templates/commitlint-rules/__tests__/rules.test.cjs
```

Expected: PASS (the test file requires `../rules.cjs` which we already wrote in Step 1). If you wrote them in order, tests should pass. If they don't, fix the rule before moving on.

> Note: this task uses `node --test` (not Vitest) because the rule pack is plain CommonJS and isn't part of any TS workspace. No build step is needed.

- [ ] **Step 6: Add the rule pack to the templates package's published files**

Edit `packages/templates/package.json` — add `"commitlint-rules"` to the `files` array so the pack ships with the npm package:

```diff
   "files": [
     "dist",
+    "commitlint-rules",
     "stacks"
   ],
```

- [ ] **Step 7: Commit**

```bash
git add packages/templates/commitlint-rules packages/templates/package.json
git commit -m "feat(templates): add @arandano/commitlint-rules pack"
```

> This commit lands BEFORE the monorepo lint rule flips, so the plain `feat(templates): …` Conventional Commits message is still accepted. Steps in later tasks will use gitmoji prefixes once the rule is live.

## Acceptance

- `packages/templates/commitlint-rules/{index,rules}.cjs` exist
- `node --test packages/templates/commitlint-rules/__tests__/rules.test.cjs` exits 0
- `packages/templates/package.json` `files` array includes `commitlint-rules`
- Curated set has exactly the 16 entries from spec §4
