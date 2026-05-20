> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T8-monorepo-flip-to-error.md`

---

id: T8
title: Flip monorepo lint from warn to error
role: coder
tdd: relaxed
depends_on: [T5, T7]

---

# T8 — Flip lint level from WARN to ERROR

**Files:**

- Modify: `.commitlintrc.cjs` (monorepo root only)

**Why:** T5 ran at warn so we could land T6 and T7 without risking a foot-gun. By now, every commit since T5 has been validated against the rule; flip to error so future commits hard-fail if they violate the format.

---

- [ ] **Step 1: Audit recent commit history against the warn rule**

```bash
git log --since="$(git log -1 --format=%cI -- .commitlintrc.cjs | head -1)" --pretty=%s
```

Run those subjects through commitlint at error level (use a temp config):

```bash
cat > /tmp/commitlint.error.cjs <<'EOF'
'use strict';
const base = require('./packages/templates/commitlint-rules');
module.exports = { ...base };
EOF

git log --since="$(git log -1 --format=%cI -- .commitlintrc.cjs | head -1)" --pretty=%s | \
  while read subj; do echo "$subj" | npx commitlint --config /tmp/commitlint.error.cjs || echo "FAIL: $subj"; done
```

Expected: no `FAIL:` lines. If any appear, fix them by amending the offending commit BEFORE flipping the rule. (Use `git rebase -i` from main, fix the subject line, force-push your branch.)

- [ ] **Step 2: Flip the rule levels**

Edit `.commitlintrc.cjs`. Change the two `[1, 'always']` entries to inherit the pack defaults (which are `[2, 'always']`):

```cjs
'use strict';

const base = require('./packages/templates/commitlint-rules');

module.exports = {
  ...base,
};
```

- [ ] **Step 3: Verify lint behaviour**

```bash
echo ":sparkles: feat(cli): test" | npx commitlint
# expected: exits 0, silent

echo "feat(cli): missing emoji" | npx commitlint
# expected: exits 1 with an error about gitmoji-leading

echo ":sparkles: fix(cli): mismatched" | npx commitlint
# expected: exits 1 with an error about gitmoji-type-match

echo "Merge pull request #5 from foo/bar" | npx commitlint
# expected: exits 0 (ignored)
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .commitlintrc.cjs
git commit -m ":lock: fix(commitlint): promote gitmoji rules from warn to error"
```

(`:lock:` because the change closes a quality-rule loophole.)

## Acceptance

- `.commitlintrc.cjs` no longer overrides the pack's default error level
- The four `echo … | npx commitlint` checks behave exactly as listed in Step 3
- `npm test` passes
