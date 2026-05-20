> **Location:** `docs/gitnexus-context/plans/v1-architect/T1-synthesize-architect-mcp.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md              ← you are here
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# T1 — Synthesized architect task carries `mcp: ['gitnexus']`

**Repo:** `arandano` (monorepo)

**Files:**

- Modify: `packages/core/src/architect/synthesizeArchitectTask.ts`
- Modify: `packages/core/src/architect/__tests__/synthesizeArchitectTask.test.ts`

**Context:** `synthesizeArchitectTask` produces the synthetic `T-architect` task that the orchestrator dispatches at the end of a plan run. Today it returns a `TaskFrontmatter` with `id`, `title`, `role`, and `depends_on` only. To let the worker know it should wire up the GitNexus MCP server, the synthesized task needs `mcp: ['gitnexus']`. Once `runOne` maps frontmatter → `TaskRun` (existing behavior: `mcpServers: taskMd.frontmatter.mcp ?? []`) and T2 makes the docker executor forward `mcpServers` into the container env, the worker will see `ARANDANO_MCP_SERVERS=gitnexus` automatically.

---

- [ ] **Step 1: Add a failing test in `synthesizeArchitectTask.test.ts`**

Append this `it` block inside the existing `describe('synthesizeArchitectTask', () => { ... })`:

```typescript
it('synthesized task requests the gitnexus MCP server', () => {
  const r = synthesizeArchitectTask({
    tasks: [t1, t2],
    planSlug: 'p',
    enabledInConfig: true,
    withArchitect: false,
    noArchitect: false,
    runShape: 'plan',
  });
  expect(r?.mcp).toEqual(['gitnexus']);
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="gitnexus MCP server"
```

Expected: 1 failed — `r.mcp` is `undefined`.

- [ ] **Step 3: Add `mcp: ['gitnexus']` to the returned object**

In `synthesizeArchitectTask.ts`, change the return statement from:

```typescript
return {
  id: 'T-architect',
  title: `Refresh docs/architecture.md after plan ${opts.planSlug}`,
  role: 'architect',
  depends_on: opts.tasks.map((t) => t.id),
};
```

to:

```typescript
return {
  id: 'T-architect',
  title: `Refresh docs/architecture.md after plan ${opts.planSlug}`,
  role: 'architect',
  depends_on: opts.tasks.map((t) => t.id),
  mcp: ['gitnexus'],
};
```

- [ ] **Step 4: Run the new test — expect it to pass**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="gitnexus MCP server"
```

Expected: `1 passed`.

- [ ] **Step 5: Run the full `packages/core` suite — expect no regressions**

```
npm test --workspace packages/core
```

Expected: all tests pass. The existing eight `synthesizeArchitectTask` tests should be unaffected — none of them assert anything about `mcp`.

- [ ] **Step 6: Commit**

```
git add packages/core/src/architect/synthesizeArchitectTask.ts packages/core/src/architect/__tests__/synthesizeArchitectTask.test.ts
git commit -m ":sparkles: feat(core): synthesized architect task requests gitnexus MCP server"
```
