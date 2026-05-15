> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T9-e2e-node-ts-toy.md`

---

id: T9
title: e2e — single-task worker run produces a passing gitmoji commit
role: coder
tdd: relaxed
depends_on: [T8]

---

# T9 — e2e on node-ts-toy

**Files (in `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy`):**

- Modify: `.commitlintrc.cjs` — switch to the new pack
- Create: `.arandano/specs/<spec-name>/plans/<slug>/T-gitmoji-smoke.md` — a trivial single-task plan
- After run: review the resulting PR to confirm the commit subject matches the new format

**Why:** Final gate of Phase 1. Confirms the worker (now containing the skill + rule pack from T3/T4) writes commits that pass the new lint rule against a live project.

---

- [ ] **Step 1: Switch node-ts-toy's commitlint config to the new pack**

In `arandano-examples/node-ts-toy/.commitlintrc.cjs`, replace:

```cjs
module.exports = { extends: ['@commitlint/config-conventional'] };
```

with:

```cjs
'use strict';
module.exports = {
  ...require('@arandano/templates/commitlint-rules'),
};
```

Then in `node-ts-toy/package.json` add `@arandano/templates` to `devDependencies` (if not already) and `npm install`.

> If `@arandano/templates` isn't published yet, link it locally:
>
> ```bash
> npm install --save-dev "file:../../arandano/packages/templates"
> ```

- [ ] **Step 2: Verify lint locally inside node-ts-toy**

```bash
cd arandano-examples/node-ts-toy
echo ":sparkles: feat: smoke" | npx commitlint
# expected: exits 0
echo "feat: smoke" | npx commitlint
# expected: exits 1
```

- [ ] **Step 3: Create a trivial single-task plan**

Create `arandano-examples/node-ts-toy/.arandano/specs/gitmoji-smoke/spec.md`:

```markdown
> **Location:** `.arandano/specs/gitmoji-smoke/spec.md`

# Gitmoji smoke test

A trivial spec used once to validate the new commit convention end-to-end.

## Goal

Confirm the worker can produce a passing commit under the new gitmoji + Conventional Commits rule.

## Acceptance

- Worker opens a PR with a gitmoji-prefixed commit subject.
- Local `commitlint` accepts every commit in the PR head.
```

Create `arandano-examples/node-ts-toy/.arandano/specs/gitmoji-smoke/plans/smoke/plan.md`:

```markdown
> **Location:** `.arandano/specs/gitmoji-smoke/plans/smoke/plan.md`

# Gitmoji smoke — Plan

## Tasks

- [ ] [T-gitmoji-smoke](T-gitmoji-smoke.md)
```

Create `arandano-examples/node-ts-toy/.arandano/specs/gitmoji-smoke/plans/smoke/T-gitmoji-smoke.md`:

```markdown
> **Location:** `.arandano/specs/gitmoji-smoke/plans/smoke/T-gitmoji-smoke.md`

---

id: T-gitmoji-smoke
title: Add a trivial constant to confirm worker commit format
role: coder
tdd: relaxed

---

# T-gitmoji-smoke

Add a new exported constant `GITMOJI_SMOKE_OK = true` to `src/index.ts` and a single test for it. All commits you produce MUST follow the `:emoji: type(scope): subject` format from `/opt/arandano/skills/gitmoji-commits/SKILL.md`.

## Steps

- [ ] Add `export const GITMOJI_SMOKE_OK = true;` to `src/index.ts`.
- [ ] Add a test that asserts the constant equals `true` to `src/__tests__/smoke.test.ts`.
- [ ] Run the test, confirm it passes.
- [ ] Commit each change as a separate gitmoji-prefixed commit.

## Acceptance

- `src/index.ts` exports `GITMOJI_SMOKE_OK`.
- The new test passes locally (`npx vitest run`).
- Each commit subject starts with one of the 16 curated emoji shortcodes.
```

- [ ] **Step 4: Run the plan via the arandano CLI**

```powershell
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=smoke
```

Expected:

- Stream of worker logs ending in `pr: https://github.com/nmunozsi/node-ts-toy/pull/<N>` and `completed=1 failed=0 skipped=0`.

If the run fails on the commit-msg gate, the worker didn't pick up the skill — go back to T3/T4 and confirm the skill is at `/opt/arandano/skills/gitmoji-commits/SKILL.md` inside the image.

- [ ] **Step 5: Verify the PR's commits**

```bash
gh pr view <N> --repo nmunozsi/node-ts-toy --json commits --jq '.commits[].messageHeadline'
```

Expected: every line starts with a curated shortcode and matches `:emoji: type(scope): subject`.

- [ ] **Step 6: Run commitlint against the PR head**

```bash
gh pr checkout <N> --repo nmunozsi/node-ts-toy
npx commitlint --from main --to HEAD
```

Expected: exits 0.

- [ ] **Step 7: Mark phase complete**

Update `docs/commits-and-architecture/plans/v1-rollout/plan.md`:

```diff
 ## Phases

-- [ ] [phase-1 — commit conventions](phase-1-commit-conventions/phase.md)
+- [x] [phase-1 — commit conventions](phase-1-commit-conventions/phase.md)
 - [ ] [phase-2 — architect role + live architecture.md](phase-2-architect-role/phase.md)
```

Update `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/phase.md`:

Tick every `- [ ]` for T1..T9.

- [ ] **Step 8: Commit the progress update**

```bash
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/commits-and-architecture/plans/v1-rollout/
git commit -m ":memo: docs(plans): mark Phase 1 complete (gitmoji rollout)"
```

## Acceptance

- A real PR exists on `nmunozsi/node-ts-toy` with every commit subject matching the curated format
- `commitlint --from main --to HEAD` on the PR head exits 0
- Phase 1 checklist marked complete in both `plan.md` and `phase.md`
- The `.commitlintrc.cjs` in `node-ts-toy` references `@arandano/templates/commitlint-rules`
