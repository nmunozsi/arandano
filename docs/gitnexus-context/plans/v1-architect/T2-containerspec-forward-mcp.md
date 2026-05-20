> **Location:** `docs/gitnexus-context/plans/v1-architect/T2-containerspec-forward-mcp.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md             ← you are here
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# T2 — containerSpec forwards `mcpServers` as `ARANDANO_MCP_SERVERS` env var

**Repo:** `arandano` (monorepo)

**Files:**

- Modify: `packages/executors-docker/src/containerSpec.ts`
- Modify: `packages/executors-docker/src/__tests__/containerSpec.test.ts`

**Context:** `TaskRun.mcpServers: string[]` exists and is already populated by `runOne` (it maps `taskMd.frontmatter.mcp ?? []`). But `buildContainerSpec` ignores it — there's no env var, no flag, nothing. Without this, the worker has no signal that the user requested any MCP server. Emit a comma-joined `ARANDANO_MCP_SERVERS` env var when `mcpServers.length > 0`; omit it entirely when empty. This unlocks both v1 (architect-only) and v2 (coder opt-in) without further executor changes.

**Prerequisite:** None — this is independent of T1, but conceptually pairs with it. Order doesn't matter for correctness; this is sequenced second so the orchestrator side is in place first.

---

- [x] **Step 1: Add three failing tests in `containerSpec.test.ts`**

Append this `describe` block at the bottom of the file (after the existing `describe('buildContainerSpec', () => { ... })`):

```typescript
describe('buildContainerSpec — MCP servers forwarding', () => {
  it('emits ARANDANO_MCP_SERVERS=<single> when one server requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: ['gitnexus'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_MCP_SERVERS=gitnexus');
  });

  it('emits ARANDANO_MCP_SERVERS=<csv> when multiple servers requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: ['gitnexus', 'foo'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_MCP_SERVERS=gitnexus,foo');
  });

  it('omits ARANDANO_MCP_SERVERS entirely when no servers requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: [] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env?.find((e) => e.startsWith('ARANDANO_MCP_SERVERS='))).toBeUndefined();
  });
});
```

- [x] **Step 2: Run the new tests to confirm they fail**

```
npm test --workspace packages/executors-docker -- --reporter=verbose --testNamePattern="MCP servers forwarding"
```

Expected: 2 fail (the omission test will pass coincidentally; the two emission tests fail because the env var is missing).

- [x] **Step 3: Add the forwarding logic in `containerSpec.ts`**

In `buildContainerSpec`, immediately before the `return` statement (i.e., after the existing `for (const [k, v] of Object.entries(task.envSet ?? {}))` loop), add:

```typescript
if (task.mcpServers.length > 0) {
  env.push(`ARANDANO_MCP_SERVERS=${task.mcpServers.join(',')}`);
}
```

For reference, the resulting tail of the function (from the `envPass` loop onward) reads:

```typescript
  for (const key of task.envPass) {
    const v = hostEnv[key];
    if (typeof v === 'string' && v.length > 0) env.push(`${key}=${v}`);
  }
  // Direct env var injection (no host lookup)
  for (const [k, v] of Object.entries(task.envSet ?? {})) {
    env.push(`${k}=${v}`);
  }

  if (task.mcpServers.length > 0) {
    env.push(`ARANDANO_MCP_SERVERS=${task.mcpServers.join(',')}`);
  }

  return {
    Image: image,
    WorkingDir: task.workdir,
    User: '1001:1001',
    Env: env,
    HostConfig: {
      Binds: [`${projectRoot}:${task.workdir}`],
      AutoRemove: false,
    },
  };
}
```

- [x] **Step 4: Run the new tests — expect all to pass**

```
npm test --workspace packages/executors-docker -- --reporter=verbose --testNamePattern="MCP servers forwarding"
```

Expected: `3 passed`.

- [x] **Step 5: Run the full executors-docker suite — expect no regressions**

```
npm test --workspace packages/executors-docker
```

Expected: all tests pass. The existing `baseTask` fixture sets `mcpServers: []`, so prior tests still match (the env var is absent, exactly as before).

- [x] **Step 6: Commit**

```
git add packages/executors-docker/src/containerSpec.ts packages/executors-docker/src/__tests__/containerSpec.test.ts
git commit -m ":sparkles: feat(executor): forward task.mcpServers as ARANDANO_MCP_SERVERS env"
```
