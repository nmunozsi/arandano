> **Location:** `docs/gitnexus-context/plans/v1-architect/T6-architect-driver-wire-mcp.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md             ← you are here
> └── T7-build-and-verify.md
> ```

# T6 — Architect driver wires MCP into invokeCli

**Repo:** `arandano-worker` (`C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker`)

**Files:**

- Modify: `lib/src/invokeClaudeCode.ts`
- Modify: `lib/src/architect/architectDriver.ts`
- Modify: `lib/src/architect/__tests__/architectDriver.test.ts`

**Context:** With the helpers in place (T5), the orchestrator pre-warming the cache (T3), and `ARANDANO_MCP_SERVERS` arriving from the executor (T2), the architect driver now needs to:

1. Check `ARANDANO_MCP_SERVERS` includes `'gitnexus'`.
2. Call `verifyGitnexusCache(workspace)` — read-only, never analyzes.
3. If `'cache-hit'`: poke registry, write `.claude/mcp.json`, pass `--mcp-config` to `invokeCli`.
4. If anything else (`'stale'`, `'missing'`, `'skipped'`): log and continue without MCP. Architect prompt already handles "no graph" gracefully.

The flag is plumbed through a new optional `mcpConfigPath?: string` on `InvokeCliOpts` so v2's coder driver reuses the same path.

**Prerequisite:** T5 (helpers exist) and T2 (env var arrives) must be merged. T3 (host pre-warm) must also be merged for end-to-end behavior to work — but T6's unit tests don't depend on T3, since they mock the helpers.

---

- [x] **Step 1: Inspect `invokeClaudeCode.ts` to find `InvokeCliOpts`**

```
cat lib/src/invokeClaudeCode.ts
```

Locate the `InvokeCliOpts` interface (or closest equivalent) — note the existing fields.

- [x] **Step 2: Add `mcpConfigPath?` to `InvokeCliOpts` and append the flag when set**

Edit `lib/src/invokeClaudeCode.ts`. Add the optional field:

```typescript
export interface InvokeCliOpts {
  cli: string;
  args: string[];
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  mcpConfigPath?: string;
}
```

Where the function builds the final argv (the spawn site), prepend the MCP flag when set. Immediately before the spawn call:

```typescript
const finalArgs = opts.mcpConfigPath
  ? [...opts.args, '--mcp-config', opts.mcpConfigPath]
  : opts.args;
```

Use `finalArgs` in place of `opts.args` in the spawn invocation. The key is that `--mcp-config <path>` appears in argv exactly when `mcpConfigPath` is set.

- [x] **Step 3: Add failing tests to `architectDriver.test.ts`**

Append a new `describe` block (do NOT touch the existing `resolvePlanContext` / `buildArchitectPrompt` / `no-op detection` blocks from architect-plan-context v1):

```typescript
import * as cacheModule from '../../mcp/cache.js';
import * as registryModule from '../../mcp/registry.js';
import * as configModule from '../../mcp/config.js';
import * as invokeModule from '../../invokeClaudeCode.js';

describe('architectMain — MCP wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env['ARANDANO_MCP_SERVERS'];
  });
  afterEach(() => {
    delete process.env['ARANDANO_MCP_SERVERS'];
  });

  it('passes --mcp-config to invokeCli when ARANDANO_MCP_SERVERS=gitnexus and cache is hit', async () => {
    process.env['ARANDANO_MCP_SERVERS'] = 'gitnexus';
    vi.spyOn(cacheModule, 'verifyGitnexusCache').mockResolvedValue('cache-hit');
    const registrySpy = vi.spyOn(registryModule, 'writeRegistryEntry').mockResolvedValue();
    const configSpy = vi
      .spyOn(configModule, 'writeMcpConfig')
      .mockResolvedValue('.claude/mcp.json');
    const invokeSpy = vi
      .spyOn(invokeModule, 'invokeCli')
      .mockResolvedValue({ exitCode: 0, output: 'architect: no-op' } as never);
    // ... (arrange identically to the existing 'no-op detection' tests in this file:
    //      mock git/createBranch/runShell/writeJournal/writeResult; set ARANDANO_TASK_ID,
    //      ARANDANO_RUN_FOLDER, ARANDANO_CLI, ARANDANO_MODEL env vars; then call architectMain.)

    expect(registrySpy).toHaveBeenCalledWith(expect.any(String));
    expect(configSpy).toHaveBeenCalledWith(expect.any(String), ['gitnexus']);
    expect(invokeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mcpConfigPath: '.claude/mcp.json' }),
    );
  });

  it('does NOT pass --mcp-config when ARANDANO_MCP_SERVERS is absent', async () => {
    const registrySpy = vi.spyOn(registryModule, 'writeRegistryEntry');
    const configSpy = vi.spyOn(configModule, 'writeMcpConfig');
    const invokeSpy = vi
      .spyOn(invokeModule, 'invokeCli')
      .mockResolvedValue({ exitCode: 0, output: 'architect: no-op' } as never);
    // ... arrange + call architectMain ...

    expect(registrySpy).not.toHaveBeenCalled();
    expect(configSpy).not.toHaveBeenCalled();
    expect(invokeSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ mcpConfigPath: expect.anything() }),
    );
  });

  it('does NOT pass --mcp-config when verifyGitnexusCache returns "stale"', async () => {
    process.env['ARANDANO_MCP_SERVERS'] = 'gitnexus';
    vi.spyOn(cacheModule, 'verifyGitnexusCache').mockResolvedValue('stale');
    const configSpy = vi.spyOn(configModule, 'writeMcpConfig');
    const invokeSpy = vi
      .spyOn(invokeModule, 'invokeCli')
      .mockResolvedValue({ exitCode: 0, output: 'architect: no-op' } as never);
    // ... arrange + call architectMain ...

    expect(configSpy).not.toHaveBeenCalled();
    expect(invokeSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ mcpConfigPath: expect.anything() }),
    );
  });

  it('does NOT pass --mcp-config when verifyGitnexusCache returns "missing"', async () => {
    process.env['ARANDANO_MCP_SERVERS'] = 'gitnexus';
    vi.spyOn(cacheModule, 'verifyGitnexusCache').mockResolvedValue('missing');
    const configSpy = vi.spyOn(configModule, 'writeMcpConfig');
    const invokeSpy = vi
      .spyOn(invokeModule, 'invokeCli')
      .mockResolvedValue({ exitCode: 0, output: 'architect: no-op' } as never);
    // ... arrange + call architectMain ...

    expect(configSpy).not.toHaveBeenCalled();
    expect(invokeSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ mcpConfigPath: expect.anything() }),
    );
  });
});
```

**On the `// arrange + call architectMain` ellipses:** the existing `architectDriver.test.ts` (post architect-plan-context v1) has a working integration-style test for `architectMain` (the no-op detection block). Copy its setup verbatim — mocking `git`, `createBranch`, `runShell`, `writeJournal`, `writeResult`, and the env vars `ARANDANO_TASK_ID`, `ARANDANO_RUN_FOLDER`, `ARANDANO_CLI`, `ARANDANO_MODEL`. The new assertions only differ in what they check; the harness is identical.

- [x] **Step 4: Run the new tests to confirm they fail**

```
cd lib && npm test -- --reporter=verbose --testNamePattern="architectMain — MCP wiring"
```

Expected: 4 fail — `mcpConfigPath` is never set today.

- [x] **Step 5: Wire the helpers into `architectDriver.ts`**

In `architectDriver.ts`, add imports at the top:

```typescript
import { verifyGitnexusCache } from '../mcp/cache.js';
import { writeRegistryEntry } from '../mcp/registry.js';
import { writeMcpConfig } from '../mcp/config.js';
```

Inside `architectMain()`, between `createBranch(...)` (existing) and `resolvePlanContext(workspace)` (existing from architect-plan-context v1), add:

```typescript
// MCP wiring — soft-fail if cache isn't ready. Orchestrator pre-warms on host (T3).
let mcpConfigPath: string | undefined;
const requestedServers = (process.env['ARANDANO_MCP_SERVERS'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
if (requestedServers.includes('gitnexus')) {
  const cacheResult = await verifyGitnexusCache(workspace);
  await writeJournal(
    join(workspace, '.arandano', 'runs', runFolder, 'journal.md'),
    `gitnexus: ${cacheResult}\n`,
  );
  if (cacheResult === 'cache-hit') {
    await writeRegistryEntry(workspace);
    mcpConfigPath = await writeMcpConfig(workspace, ['gitnexus']);
  }
}
```

Update the `invokeCli` call to pass `mcpConfigPath`. The existing call looks roughly like:

```typescript
const cliRun = await invokeCli({
  cli,
  args: ['--print', '--dangerously-skip-permissions', '--model', model],
  prompt,
  cwd: workspace,
  env: process.env,
});
```

Change it to:

```typescript
const cliRun = await invokeCli({
  cli,
  args: ['--print', '--dangerously-skip-permissions', '--model', model],
  prompt,
  cwd: workspace,
  env: process.env,
  ...(mcpConfigPath ? { mcpConfigPath } : {}),
});
```

The `...(cond ? { x } : {})` pattern keeps the option absent when undefined — preserves existing tests that assert `mcpConfigPath` is absent.

- [x] **Step 6: Run the new tests — expect all to pass**

```
cd lib && npm test -- --reporter=verbose --testNamePattern="architectMain — MCP wiring"
```

Expected: `4 passed`.

- [x] **Step 7: Run the full worker test suite — expect no regressions**

```
cd lib && npm test
```

Expected: all tests pass — including the architect-plan-context v1 tests for `resolvePlanContext`, `buildArchitectPrompt`, and `no-op detection`.

- [x] **Step 8: Commit**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src/invokeClaudeCode.ts lib/src/architect/architectDriver.ts lib/src/architect/__tests__/architectDriver.test.ts
git commit -m ":sparkles: feat(worker): architect driver wires gitnexus MCP via --mcp-config (verify-only)"
```
