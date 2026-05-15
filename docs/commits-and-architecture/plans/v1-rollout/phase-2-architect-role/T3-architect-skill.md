> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T3-architect-skill.md`

---

id: T3
title: architect skill — SKILL.md + task body template
role: coder
tdd: relaxed
depends_on: [T2]

---

# T3 — Architect skill and synthetic task body template

**Files:**

- Create: `packages/skills/src/skills/architect/SKILL.md`
- Create: `packages/skills/src/skills/architect/template.md.tpl` (body of the synthetic `T-architect` task)
- Modify: `packages/skills/src/registry.ts` (register the second skill)
- Modify: `packages/skills/src/__tests__/registry.test.ts`

**Why:** The skill teaches the worker how to edit `architecture.md` minimally. The task body template is the MD file the orchestrator writes when it synthesizes the architect task — the worker reads it like any other task file.

---

- [ ] **Step 1: Author SKILL.md**

Create `packages/skills/src/skills/architect/SKILL.md`:

````markdown
---
name: architect
description: Use when assigned the architect role. Updates docs/architecture.md to reflect the just-merged plan's changes. Minimal-diff edits only.
---

# Architect skill

You are running as the `architect` role. Your one job is to refresh `docs/architecture.md` so it reflects what the just-finished plan actually shipped.

## Inputs available to you

- `docs/architecture.md` — the current file.
- Plan files (path provided by the orchestrator): `<spec>/plans/<plan-slug>/{spec.md, plan.md, phase-*/phase.md, T*.md}`.
- Git history of the plan's merge range: `git log <base>..<head>` (the range is in env var `ARANDANO_PLAN_MERGE_RANGE`).

## The template (the doc has exactly these six sections)

| §   | Section        | What it owns                                   |
| --- | -------------- | ---------------------------------------------- |
| 1   | Overview       | One paragraph.                                 |
| 2   | Components     | Table: component, path, responsibility, stack. |
| 3   | Data flow      | One mermaid diagram.                           |
| 4   | Tech stack     | Bullets.                                       |
| 5   | Key decisions  | Append-only, dated, newest first.              |
| 6   | Open questions | Same format as §5. Removed when resolved.      |

## Rules

- **DO** append one entry to §5 dated today, summarizing the plan's net architectural change in 1–3 sentences. Use this format exactly:

  ```
  - **YYYY-MM-DD — D<n>: <short title>.** _Why:_ <reason>. _Trade-off:_ <trade>. _Owner:_ @<handle>.
  ```

  `<n>` is one greater than the highest existing `Dn` in §5. If the file has no entries yet, start at `D1`.

- **DO** edit §2 rows when a component's responsibility or path changed.

- **DO** add a new §2 row when the plan introduced a new package, executable, or first-class subsystem.

- **DO** edit the §3 diagram **only** when §2 changed (new component, removed component, or changed responsibility). The diagram lists nodes equal to §2 rows.

- **DO** edit §4 when the plan introduced a new language, runtime, build tool, test framework, CI system, or external service.

- **DO NOT** rewrite or reorder existing §5 entries.

- **DO NOT** delete a §2 row without also adding a §5 entry explaining the removal.

- **DO NOT** touch §3 when §2 didn't change.

- **DO NOT** touch §1 unless the project's purpose changed — typically you won't.

- **DO NOT** add a §6 entry unless the plan exposed a real open question.

## Worked examples

### Example A — plan added a new package

Plan: introduced `@arandano/executors-k8s` and a new `K8sExecutor` class.

Edit:

- §2: add `| K8s executor | packages/executors-k8s | Dispatch tasks to Kubernetes | TypeScript |`.
- §3: add `k8s[K8s executor]` node + `cli --> k8s`.
- §5: append `- **2026-05-20 — D7: Add K8s executor.** _Why:_ homelab readiness. _Trade-off:_ second executor to maintain. _Owner:_ @nmunozsi.`

### Example B — plan refactored internals only

Plan: extracted DAG validation into a separate file; no public API change.

Edit:

- §5: append `- **2026-05-21 — D8: Extract DAG validator.** _Why:_ readability. _Trade-off:_ none. _Owner:_ @nmunozsi.`
- §2/§3/§4/§6 untouched.

## When the diff is empty

If after applying the rules above your changes would not modify the file, **do not commit**. Print `architect: no-op` to stdout. The worker's `architect-driver` recognises this and skips PR creation.

## Commits

Every commit you make follows the gitmoji format from the `gitmoji-commits` skill. The only commits the architect should produce are:

- `:memo: docs(arch): refresh after <plan-slug>` — the single edit commit.
````

- [ ] **Step 2: Author the task body template**

Create `packages/skills/src/skills/architect/template.md.tpl`:

````markdown
---
id: T-architect
title: Refresh docs/architecture.md after plan {{plan_slug}}
role: architect
tdd: relaxed
depends_on: [{ { depends_on_csv } }]
---

# Refresh docs/architecture.md

The plan `{{plan_slug}}` just merged the following commit range:

```
{{merge_range}}
```

Read the SKILL.md at `/opt/arandano/skills/architect/SKILL.md` and apply minimal edits to `docs/architecture.md` per its rules.

## Inputs

- Current arch doc: `docs/architecture.md`
- Plan: `{{plan_path}}`
- Diff: `git log {{merge_range}}` and `git diff {{merge_range}}`

## Acceptance

- `docs/architecture.md` has exactly one new entry appended to §5, dated `{{date}}`.
- §2/§3/§4/§6 are edited only as required by the SKILL's rules.
- One commit: `:memo: docs(arch): refresh after {{plan_slug}}`.
- If no architectural change applies, print `architect: no-op` and produce no commit.
````

- [ ] **Step 3: Register the architect skill**

Edit `packages/skills/src/registry.ts`:

```diff
 export const BUNDLED_SKILLS: SkillMeta[] = [
   {
     name: 'gitmoji-commits',
     description:
       'Use whenever creating a Git commit. Every commit subject must start with one of the 16 curated gitmoji shortcodes paired with a Conventional Commits type.',
   },
+  {
+    name: 'architect',
+    description:
+      'Use when assigned the architect role. Updates docs/architecture.md to reflect the just-merged plan with minimal-diff edits.',
+  },
 ];
```

- [ ] **Step 4: Extend the registry test**

Append to `packages/skills/src/__tests__/registry.test.ts`:

```ts
it('includes architect', () => {
  expect(BUNDLED_SKILLS.find((s) => s.name === 'architect')).toBeDefined();
});
```

- [ ] **Step 5: Run tests**

```bash
npm test --workspace=@arandano/skills
```

Expected: PASS.

- [ ] **Step 6: Run build to confirm assets are shipped**

```bash
npm run build --workspace=@arandano/skills
ls packages/skills/dist/skills/architect
```

Expected: `SKILL.md` and `template.md.tpl` both present.

- [ ] **Step 7: Commit**

```bash
git add packages/skills/src/skills/architect packages/skills/src/registry.ts \
        packages/skills/src/__tests__/registry.test.ts
git commit -m ":sparkles: feat(skills): architect skill + synthetic-task template"
```

## Acceptance

- `packages/skills/src/skills/architect/{SKILL.md, template.md.tpl}` exist with the content above
- `BUNDLED_SKILLS` includes both `gitmoji-commits` and `architect`
- `npm test --workspace=@arandano/skills` passes
- `packages/skills/dist/skills/architect/` contains both files after build
