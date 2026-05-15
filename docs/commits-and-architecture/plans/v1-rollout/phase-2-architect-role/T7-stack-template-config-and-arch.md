> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T7-stack-template-config-and-arch.md`

---

id: T7
title: Stack templates — architect config + architecture.md skeleton
role: coder
tdd: relaxed
depends_on: [T2, T6]

---

# T7 — Stack templates ship architect config + arch skeleton

**Files:**

- Modify: `packages/templates/stacks/node-ts/.arandano/config.yaml.tpl`
- Modify: `packages/templates/stacks/python/.arandano/config.yaml.tpl`
- Modify: `packages/templates/stacks/go/.arandano/config.yaml.tpl`
- Create: `packages/templates/stacks/node-ts/docs/architecture.md.tpl`
- Create: `packages/templates/stacks/python/docs/architecture.md.tpl`
- Create: `packages/templates/stacks/go/docs/architecture.md.tpl`
- Modify: `packages/templates/src/__tests__/scaffold.test.ts` (assert both files reach the scaffolded project)

**Why:** `arandano init` writes both files into every new project so the architect role can run on the first plan execution without setup.

---

- [ ] **Step 1: Add the architect role block to each stack's config.yaml.tpl**

In each of the three `config.yaml.tpl` files, append an `architect:` role block under `roles:`:

```diff
 roles:
   coder:
     cli: claude-code
     model: claude-sonnet-4-6
     tdd: strict
+  architect:
+    cli: claude-code
+    model: claude-sonnet-4-6
+    enabled: true
```

For the `python` and `go` stack files, mirror the same edit. Inspect each before editing — the `coder` block may differ slightly.

- [ ] **Step 2: Drop the architecture.md.tpl into each stack's docs/**

Each stack already has a `docs/` directory (visible in the `node-ts` listing — see CLAUDE.md's e2e learnings about prettier). Copy the canonical template:

```bash
for stack in node-ts python go; do
  cp packages/templates/assets/architecture.md.tpl \
     packages/templates/stacks/$stack/docs/architecture.md.tpl
done
```

> Reuse the asset rather than duplicating content. Both copies must stay in sync; if the canonical asset changes, this step re-runs.

- [ ] **Step 3: Extend the scaffold test**

Append to `packages/templates/src/__tests__/scaffold.test.ts`:

```ts
describe('scaffold architect surface', () => {
  it('node-ts ships docs/architecture.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'arandano-arch-'));
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'demo',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'a@b',
    });
    const arch = await readFile(join(dir, 'docs', 'architecture.md'), 'utf8');
    expect(arch).toContain('# demo — Architecture');
    expect(arch).toContain('## 6. Open questions');
  });

  it('node-ts config.yaml ships an architect role block', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'arandano-cfg-'));
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'demo',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'a@b',
    });
    const cfg = await readFile(join(dir, '.arandano', 'config.yaml'), 'utf8');
    expect(cfg).toMatch(/architect:\s*\n\s*cli:/);
    expect(cfg).toMatch(/enabled:\s*true/);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace=@arandano/templates
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/templates/stacks/*/.arandano/config.yaml.tpl \
        packages/templates/stacks/*/docs/architecture.md.tpl \
        packages/templates/src/__tests__/scaffold.test.ts
git commit -m ":sparkles: feat(templates): scaffold architect role + docs/architecture.md"
```

## Acceptance

- All three stacks' `config.yaml.tpl` include the architect block
- All three stacks ship `docs/architecture.md.tpl`
- Scaffold tests confirm both reach the scaffolded project for `node-ts`
- `npm test` passes
