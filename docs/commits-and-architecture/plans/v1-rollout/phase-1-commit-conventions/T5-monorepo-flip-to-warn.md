> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T5-monorepo-flip-to-warn.md`

---

id: T5
title: Flip monorepo .commitlintrc.cjs to the new pack (warn level)
role: coder
tdd: relaxed
depends_on: [T1, T4]

---

# T5 — Flip monorepo lint to WARN

**Files:**

- Modify: `.commitlintrc.cjs` (monorepo root)
- Verify: `package.json` (commitlint must already be a devDependency — it is, since lint-staged uses it; confirm)

**Why:** This is the first place the new rule pack is actually consumed. We turn it on at _warn_ level first so that any commit shape we missed in T1 surfaces as a warning, not a hard rejection. The flip to _error_ happens in T8 after we've validated worker output.

---

- [ ] **Step 1: Replace `.commitlintrc.cjs` content**

Read the current file (`module.exports = { extends: ['@commitlint/config-conventional'] };`) and overwrite with:

```cjs
'use strict';

const base = require('./packages/templates/commitlint-rules');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'gitmoji-leading': [1, 'always'], // warn during T5–T7; flip to 2 (error) in T8
    'gitmoji-type-match': [1, 'always'],
  },
};
```

- [ ] **Step 2: Verify commitlint resolves the pack**

```bash
echo ":sparkles: feat(cli): test" | npx commitlint
```

Expected: exits 0, no output (no warnings).

```bash
echo "feat(cli): missing emoji" | npx commitlint
```

Expected: exits 0 but prints a `warning` line about `gitmoji-leading`.

```bash
echo ":sparkles: fix(cli): mismatched type" | npx commitlint
```

Expected: exits 0 but prints a `warning` line about `gitmoji-type-match`.

- [ ] **Step 3: Run the existing repo test suite**

```bash
npm test
```

Expected: PASS. No commitlint-specific tests yet at the monorepo level.

- [ ] **Step 4: Commit using the new convention**

```bash
git add .commitlintrc.cjs
git commit -m ":wrench: chore(commitlint): adopt gitmoji rule pack at warn level"
```

Expected: commit accepts. (The rule is now at warn, so even a missing emoji would pass — but we use a correct one anyway.)

## Acceptance

- `.commitlintrc.cjs` references `./packages/templates/commitlint-rules`
- Test inputs above produce the expected warn/no-warn outcomes
- `npm test` still passes
- Commit lands with a `:wrench: chore(commitlint): …` subject
