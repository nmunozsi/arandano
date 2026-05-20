> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T12-e2e-two-task-plan.md`

---

id: T12
title: e2e two-task plan against node-ts-toy
role: coder
tdd: relaxed
depends_on: [T11]

---

# T12 — Final e2e for Phase 2

**Files (in `node-ts-toy`):**

- Create: `.arandano/specs/arch-smoke/spec.md`
- Create: `.arandano/specs/arch-smoke/plans/smoke/plan.md`
- Create: `.arandano/specs/arch-smoke/plans/smoke/T1-add-helper.md`
- Create: `.arandano/specs/arch-smoke/plans/smoke/T2-add-second-helper.md`

**Why:** Prove the full pipeline. Two real coder tasks + an auto-spawned architect task = three branches and three PRs against `nmunozsi/node-ts-toy`, the architect PR titled `:memo: docs(arch): refresh after smoke` with a non-empty diff against `docs/architecture.md`.

---

- [ ] **Step 1: Author the spec**

Create `arandano-examples/node-ts-toy/.arandano/specs/arch-smoke/spec.md`:

```markdown
> **Location:** `.arandano/specs/arch-smoke/spec.md`

# Architect smoke

Trivial two-task plan to validate that an architect task auto-spawns and refreshes `docs/architecture.md`.

## Acceptance

- Both coder tasks open PRs that pass quality gates.
- A third PR appears titled `:memo: docs(arch): refresh after smoke` with a non-empty diff against `docs/architecture.md`.
```

- [ ] **Step 2: Author the plan and tasks**

Create `arandano-examples/node-ts-toy/.arandano/specs/arch-smoke/plans/smoke/plan.md`:

```markdown
> **Location:** `.arandano/specs/arch-smoke/plans/smoke/plan.md`

# Architect smoke — Plan

## Tasks

- [ ] [T1 — add helper one](T1-add-helper.md)
- [ ] [T2 — add helper two](T2-add-second-helper.md)
```

Create `arandano-examples/node-ts-toy/.arandano/specs/arch-smoke/plans/smoke/T1-add-helper.md`:

```markdown
> **Location:** `.arandano/specs/arch-smoke/plans/smoke/T1-add-helper.md`

---

id: T1
title: Add archSmokeOne helper
role: coder
tdd: relaxed

---

Add `export const archSmokeOne = () => 1;` to `src/index.ts` plus a vitest assertion.
```

Create `arandano-examples/node-ts-toy/.arandano/specs/arch-smoke/plans/smoke/T2-add-second-helper.md`:

```markdown
> **Location:** `.arandano/specs/arch-smoke/plans/smoke/T2-add-second-helper.md`

---

id: T2
title: Add archSmokeTwo helper
role: coder
tdd: relaxed

---

Add `export const archSmokeTwo = () => 2;` to `src/index.ts` plus a vitest assertion.
```

- [ ] **Step 3: Format the new MD files**

```bash
cd arandano-examples/node-ts-toy
npx prettier --write .arandano/specs/arch-smoke/
```

- [ ] **Step 4: Dispatch the plan via the CLI**

```powershell
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=smoke
```

Expected: the orchestrator runs T1, T2, then T-architect. Output ends with:

```
completed=3 failed=0 skipped=0
```

If the architect step exits 0 but opens no PR, the worker logged `architect: no-op` — that's a regression, since seeding the doc by hand (T11 step 2) gave the architect real content to react to. Investigate: confirm the prompt actually instructed the agent to add a §5 entry; confirm `ARANDANO_PLAN_MERGE_RANGE` was set by the Orchestrator (it isn't — see follow-up below).

- [ ] **Step 5: Verify the architect PR exists with the right title and a real diff**

```bash
gh pr list --repo nmunozsi/node-ts-toy --state open --json title,headRefName
```

Expected: one entry with title `:memo: docs(arch): refresh after smoke`.

```bash
gh pr view <architect-pr-number> --repo nmunozsi/node-ts-toy --json files \
  --jq '.files[].path'
```

Expected: contains `docs/architecture.md` and no other path.

```bash
gh pr diff <architect-pr-number> --repo nmunozsi/node-ts-toy | head -40
```

Expected: a clean diff appending one entry to §5 dated today.

- [ ] **Step 6: Verify the no-op path on a no-change plan**

Create a one-task plan `arandano-examples/node-ts-toy/.arandano/specs/arch-smoke/plans/noop/T1-noop.md` whose body is "Add a blank line at the end of `README.md` and commit. No code change." Run:

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan=noop
```

Then check that no architect PR was opened (only the coder PR exists):

```bash
gh pr list --repo nmunozsi/node-ts-toy --state open --json title --jq '.[].title'
```

Expected: no entry starting with `:memo: docs(arch): refresh after noop`. Confirm `state.json` records `T-architect.result = "no-op"`:

```bash
cat arandano-examples/node-ts-toy/.arandano/state.json | python -m json.tool | grep -A 3 T-architect
```

- [ ] **Step 7: Mark phase + plan complete**

In the arandano monorepo, tick every `- [ ]` in `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/phase.md` and tick the Phase 2 entry in `docs/commits-and-architecture/plans/v1-rollout/plan.md`.

Commit:

```bash
git add docs/commits-and-architecture/plans/v1-rollout/
git commit -m ":memo: docs(plans): mark Phase 2 complete (architect role rolled out)"
```

## Follow-up to capture

If Step 4's run exposes that `ARANDANO_PLAN_MERGE_RANGE` is never set by the Orchestrator (T5 just synthesizes the task; it doesn't compute the range), add a `- [ ]` line to `plan.md` under "Follow-ups" titled `populate ARANDANO_PLAN_MERGE_RANGE in synthetic architect task env` and write a fresh task MD describing the fix. Do NOT block T12 acceptance on this — log it and move on.

## Acceptance

- Two coder PRs + one architect PR landed against `nmunozsi/node-ts-toy`
- The architect PR's title is exactly `:memo: docs(arch): refresh after smoke`
- The architect PR's diff touches only `docs/architecture.md`
- A separate no-op smoke confirms the architect skips PR creation when nothing applies
- Phase 2 ticked complete in `phase.md` and `plan.md`
