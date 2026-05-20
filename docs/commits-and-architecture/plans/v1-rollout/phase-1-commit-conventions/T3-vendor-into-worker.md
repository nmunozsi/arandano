> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T3-vendor-into-worker.md`

---

id: T3
title: Vendor rule pack + skill into arandano-worker
role: coder
tdd: relaxed
depends_on: [T1, T2]

---

# T3 — Vendor commitlint rule pack and gitmoji skill into the worker repo

**Files (in the separate `arandano-worker` repo at `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker`):**

- Create: `arandano-worker/lib/src/skills/gitmoji-commits/SKILL.md` (copy from monorepo)
- Create: `arandano-worker/lib/src/commitlint-rules/index.cjs` (copy from monorepo)
- Create: `arandano-worker/lib/src/commitlint-rules/rules.cjs` (copy from monorepo)
- Modify: `arandano-worker/lib/src/driver.ts` (add prompt instruction that points at the gitmoji-commits skill)
- Modify: `arandano-worker/Dockerfile` (copy the skill + rule pack into the image)

**Why:** The worker container needs:

1. The skill MD so Claude Code can read it during a task.
2. The rule pack vendored locally so `npx commitlint` inside the container resolves it without an `npm install` round trip.

---

- [ ] **Step 1: Copy the SKILL.md verbatim into the worker repo**

```bash
mkdir -p arandano-worker/lib/src/skills/gitmoji-commits
cp arandano/packages/skills/src/skills/gitmoji-commits/SKILL.md \
   arandano-worker/lib/src/skills/gitmoji-commits/SKILL.md
```

- [ ] **Step 2: Copy the rule pack verbatim into the worker repo**

```bash
mkdir -p arandano-worker/lib/src/commitlint-rules
cp arandano/packages/templates/commitlint-rules/index.cjs \
   arandano-worker/lib/src/commitlint-rules/index.cjs
cp arandano/packages/templates/commitlint-rules/rules.cjs \
   arandano-worker/lib/src/commitlint-rules/rules.cjs
```

- [ ] **Step 3: Wire the skill into the driver prompt**

Edit `arandano-worker/lib/src/driver.ts`. Around line 93–99 there's an array building the CLI prompt. Add a line directing the agent to read the skill:

```diff
   const prompt = [
     `You are running as the ${task.role} role.`,
-    `Read .arandano/roles/${task.role}.md, src/CONTEXT.md, planning/memory/coding-standards.md.`,
+    `Read .arandano/roles/${task.role}.md, src/CONTEXT.md, planning/memory/coding-standards.md.`,
+    `Read the SKILL.md at /opt/arandano/skills/gitmoji-commits/SKILL.md and follow its commit format on every commit you produce.`,
     `Task file: ${task.filePath}.`,
-    `Use TDD (${tdd}). Make conventional commits.`,
+    `Use TDD (${tdd}). Every commit MUST follow the gitmoji-commits skill format.`,
     `Do not push or open the PR yourself — the worker will after gates pass.`,
   ].join('\n');
```

- [ ] **Step 4: Wire the SKILL and rule pack into the Dockerfile**

Edit `arandano-worker/Dockerfile`. Find the section that copies application code (after the `COPY` of `lib/dist`). Add:

```dockerfile
# Bake the gitmoji-commits skill into a known path the prompt references.
COPY lib/src/skills/gitmoji-commits/SKILL.md /opt/arandano/skills/gitmoji-commits/SKILL.md

# Vendor the commitlint rule pack so `npx commitlint` resolves it without npm install.
COPY lib/src/commitlint-rules /opt/arandano/commitlint-rules
```

- [ ] **Step 5: Sanity-check the rule pack runs without npm**

From the `arandano-worker` repo root, simulate what the container will do:

```bash
cd arandano-worker/lib/src/commitlint-rules
node -e "const c=require('./index.cjs');console.log(Object.keys(c));console.log(c.rules);"
```

Expected: prints `[ 'extends', 'plugins', 'rules', 'ignores' ]`.

- [ ] **Step 6: Commit in the worker repo**

```bash
cd arandano-worker
git add lib/src/skills lib/src/commitlint-rules lib/src/driver.ts Dockerfile
git commit -m "feat(worker): bundle gitmoji-commits skill and commitlint rule pack"
git push origin main
```

> Per CLAUDE.md, pushing to `arandano-worker` `main` triggers the `release.yml` workflow that rebuilds and pushes the GHCR image. T4 watches for it.

## Acceptance

- The four files exist in `arandano-worker/lib/src/`
- `driver.ts` prompt mentions the skill path `/opt/arandano/skills/gitmoji-commits/SKILL.md`
- Dockerfile copies both the skill and the rule pack
- `node -e "require('./index.cjs')"` succeeds inside `arandano-worker/lib/src/commitlint-rules`
- Worker commit pushed to `main`
