> **Location:** `docs/gitnexus-context/plans/v1-architect/T5-worker-mcp-helpers.md`
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
> ├── T5-worker-mcp-helpers.md                    ← you are here
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# T5 — Worker MCP helpers module (verify + registry + config)

**Repo:** `arandano-worker` (`C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker`)

**Files:**

- Create: `lib/src/mcp/cache.ts` (verify-only)
- Create: `lib/src/mcp/registry.ts` (registry-poke)
- Create: `lib/src/mcp/config.ts` (write mcp.json)
- Create: `lib/src/mcp/__tests__/cache.test.ts`
- Create: `lib/src/mcp/__tests__/registry.test.ts`
- Create: `lib/src/mcp/__tests__/config.test.ts`

**Context:** The orchestrator (T3) handles cache analysis on the host. The worker side just needs three small, single-purpose helpers:

1. `verifyGitnexusCache` — read-only check that `.gitnexus/.head-stamp` matches `git rev-parse HEAD` inside the container. **Never runs analyze.**
2. `writeRegistryEntry` — defensive poke at `~/.gitnexus/registry.json` so `gitnexus mcp` knows the bind-mounted repo exists. Registry schema is undocumented; T5 includes a spike to reverse-engineer it.
3. `writeMcpConfig` — write the `.claude/mcp.json` file Claude Code reads when given `--mcp-config`.

All three are pure utilities — no env access, no orchestration. Architect driver wiring lands in T6.

**Prerequisite:** None of T1–T4 are strict prerequisites for writing/testing the helpers themselves, but the helpers won't matter until T6 wires them in and T7 verifies end-to-end.

---

- [x] **Step 1 (spike): Determine the registry.json schema**

Reverse-engineering the registry shape is the only undocumented piece. Run this once locally, outside any task:

```
# Use a throwaway temp dir to avoid polluting your real ~/.gitnexus
mkdir /tmp/gn-spike && cd /tmp/gn-spike
git init -q && echo "console.log(1)" > a.ts && git add . && git commit -q -m init
gitnexus analyze
cat ~/.gitnexus/registry.json
```

Record the resulting JSON shape. It will likely look something like:

```json
{
  "repos": [{ "path": "/tmp/gn-spike", "name": "gn-spike", "indexed_at": "2026-05-19T..." }]
}
```

The exact keys depend on the GitNexus version. Use the shape you observe in Step 3 below. **If the registry is empty or absent after analyze, the registry-poke isn't needed** — `gitnexus mcp` must already discover via cwd. In that case, replace `writeRegistryEntry` with a no-op (return immediately) and document the finding inline in `registry.ts`.

- [x] **Step 2: Create `lib/src/mcp/cache.ts`**

```typescript
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runShell } from '../gates/_shell.js';

export type CacheResult = 'cache-hit' | 'stale' | 'missing' | 'skipped';

const STAMP_REL_PATH = '.gitnexus/.head-stamp';

async function gitnexusOnPath(): Promise<boolean> {
  const r = await runShell({ cmd: 'which', args: ['gitnexus'], cwd: process.cwd() });
  return r.exitCode === 0;
}

async function currentHead(workspaceRoot: string): Promise<string | null> {
  const r = await runShell({ cmd: 'git', args: ['rev-parse', 'HEAD'], cwd: workspaceRoot });
  if (r.exitCode !== 0) return null;
  return r.output.trim();
}

/**
 * Verify the host has already prepared `.gitnexus/` for this workspace.
 * NEVER runs analyze. Returns the cache state so the caller can decide.
 */
export async function verifyGitnexusCache(workspaceRoot: string): Promise<CacheResult> {
  if (!(await gitnexusOnPath())) return 'skipped';
  if (!existsSync(join(workspaceRoot, '.gitnexus'))) return 'missing';

  const head = await currentHead(workspaceRoot);
  if (!head) return 'skipped';

  const stampPath = join(workspaceRoot, STAMP_REL_PATH);
  if (!existsSync(stampPath)) return 'missing';
  try {
    const stamp = (await readFile(stampPath, 'utf8')).trim();
    return stamp === head ? 'cache-hit' : 'stale';
  } catch {
    return 'missing';
  }
}
```

- [x] **Step 3: Create `lib/src/mcp/registry.ts`**

Use the schema you observed in Step 1. The skeleton below assumes the `{ repos: [{ path, name, indexed_at }] }` shape — adapt as needed:

```typescript
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const REGISTRY_PATH = join(homedir(), '.gitnexus', 'registry.json');

interface RegistryEntry {
  path: string;
  name: string;
  indexed_at: string;
}

interface Registry {
  repos: RegistryEntry[];
}

/**
 * Idempotently register the workspace in ~/.gitnexus/registry.json so
 * `gitnexus mcp` discovers it. If GitNexus already discovers the workspace
 * without a registry entry (per the spike), this becomes a harmless no-op.
 *
 * Never throws — registry-poke failures are non-fatal.
 */
export async function writeRegistryEntry(workspaceRoot: string): Promise<void> {
  try {
    await mkdir(join(homedir(), '.gitnexus'), { recursive: true });

    let registry: Registry = { repos: [] };
    if (existsSync(REGISTRY_PATH)) {
      try {
        const raw = await readFile(REGISTRY_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<Registry>;
        registry = { repos: parsed.repos ?? [] };
      } catch {
        // malformed — overwrite with a fresh registry
      }
    }

    const existing = registry.repos.find((r) => r.path === workspaceRoot);
    const entry: RegistryEntry = {
      path: workspaceRoot,
      name: basename(workspaceRoot),
      indexed_at: new Date().toISOString(),
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      registry.repos.push(entry);
    }

    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  } catch {
    // soft-fail — caller continues without registry update
  }
}
```

If the spike found the registry is unneeded, replace the function body with a single early `return`:

```typescript
export async function writeRegistryEntry(_workspaceRoot: string): Promise<void> {
  // Spike confirmed gitnexus mcp discovers .gitnexus/ in cwd without registry entry; no-op.
  return;
}
```

- [x] **Step 4: Create `lib/src/mcp/config.ts`**

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface McpServerEntry {
  command: string;
  args: string[];
}

const KNOWN_SERVERS: Record<string, McpServerEntry> = {
  gitnexus: { command: 'gitnexus', args: ['mcp'] },
};

/**
 * Writes a Claude Code MCP config at `<workspaceRoot>/.claude/mcp.json`.
 * Returns the workspace-relative path to the written file.
 */
export async function writeMcpConfig(workspaceRoot: string, servers: string[]): Promise<string> {
  const entries: Record<string, McpServerEntry> = {};
  for (const name of servers) {
    const entry = KNOWN_SERVERS[name];
    if (entry) entries[name] = entry;
  }

  const relPath = '.claude/mcp.json';
  const absPath = join(workspaceRoot, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, JSON.stringify({ mcpServers: entries }, null, 2) + '\n', 'utf8');
  return relPath;
}
```

- [x] **Step 5: Create `lib/src/mcp/__tests__/cache.test.ts`**

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyGitnexusCache } from '../cache.js';

vi.mock('../../gates/_shell.js', () => ({
  runShell: vi.fn(),
}));
import { runShell } from '../../gates/_shell.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gn-verify-'));
  vi.mocked(runShell).mockReset();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const mockShell = (mocks: Array<{ exitCode: number; output: string }>): void => {
  let i = 0;
  vi.mocked(runShell).mockImplementation(async () => mocks[i++] ?? { exitCode: 0, output: '' });
};

describe('verifyGitnexusCache', () => {
  it('returns "skipped" when gitnexus binary missing', async () => {
    mockShell([{ exitCode: 1, output: '' }]);
    expect(await verifyGitnexusCache(dir)).toBe('skipped');
  });

  it('returns "missing" when .gitnexus/ directory absent', async () => {
    mockShell([{ exitCode: 0, output: '/usr/bin/gitnexus' }]);
    expect(await verifyGitnexusCache(dir)).toBe('missing');
  });

  it('returns "missing" when stamp file absent', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    mockShell([
      { exitCode: 0, output: '/usr/bin/gitnexus' },
      { exitCode: 0, output: 'abc\n' },
    ]);
    expect(await verifyGitnexusCache(dir)).toBe('missing');
  });

  it('returns "cache-hit" when stamp matches HEAD', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    await writeFile(join(dir, '.gitnexus', '.head-stamp'), 'abc123', 'utf8');
    mockShell([
      { exitCode: 0, output: '/usr/bin/gitnexus' },
      { exitCode: 0, output: 'abc123\n' },
    ]);
    expect(await verifyGitnexusCache(dir)).toBe('cache-hit');
  });

  it('returns "stale" when stamp mismatches HEAD', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    await writeFile(join(dir, '.gitnexus', '.head-stamp'), 'old', 'utf8');
    mockShell([
      { exitCode: 0, output: '/usr/bin/gitnexus' },
      { exitCode: 0, output: 'new\n' },
    ]);
    expect(await verifyGitnexusCache(dir)).toBe('stale');
  });

  it('never spawns "gitnexus analyze" under any path', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    mockShell([
      { exitCode: 0, output: '/usr/bin/gitnexus' },
      { exitCode: 0, output: 'sha\n' },
    ]);
    await verifyGitnexusCache(dir);
    const calls = vi
      .mocked(runShell)
      .mock.calls.map(([opts]) => opts as { cmd: string; args?: string[] });
    expect(calls.some((c) => c.cmd === 'gitnexus' && (c.args ?? []).includes('analyze'))).toBe(
      false,
    );
  });
});
```

- [x] **Step 6: Create `lib/src/mcp/__tests__/registry.test.ts`**

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { writeRegistryEntry } from '../registry.js';

let fakeHome: string;
let realHome: string;
beforeEach(async () => {
  fakeHome = await mkdtemp(join(tmpdir(), 'gn-home-'));
  realHome = homedir();
  // Override HOME so node:os homedir() returns our fake. On Windows, USERPROFILE.
  process.env['HOME'] = fakeHome;
  process.env['USERPROFILE'] = fakeHome;
  vi.resetModules();
});
afterEach(async () => {
  await rm(fakeHome, { recursive: true, force: true });
  process.env['HOME'] = realHome;
  process.env['USERPROFILE'] = realHome;
});

describe('writeRegistryEntry', () => {
  it('creates ~/.gitnexus/registry.json with a single repo entry on first call', async () => {
    const { writeRegistryEntry: fn } = await import('../registry.js');
    await fn('/workspace/foo');
    const raw = await readFile(join(fakeHome, '.gitnexus', 'registry.json'), 'utf8');
    const reg = JSON.parse(raw) as { repos: Array<{ path: string; name: string }> };
    expect(reg.repos).toHaveLength(1);
    expect(reg.repos[0]?.path).toBe('/workspace/foo');
    expect(reg.repos[0]?.name).toBe('foo');
  });

  it('is idempotent — second call updates timestamp but does not duplicate', async () => {
    const { writeRegistryEntry: fn } = await import('../registry.js');
    await fn('/workspace/foo');
    await fn('/workspace/foo');
    const raw = await readFile(join(fakeHome, '.gitnexus', 'registry.json'), 'utf8');
    const reg = JSON.parse(raw) as { repos: unknown[] };
    expect(reg.repos).toHaveLength(1);
  });

  it('overwrites a malformed registry without throwing', async () => {
    const { writeRegistryEntry: fn } = await import('../registry.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(fakeHome, '.gitnexus'), { recursive: true });
    await writeFile(join(fakeHome, '.gitnexus', 'registry.json'), '{not valid json', 'utf8');
    await expect(fn('/workspace/foo')).resolves.toBeUndefined();
    const raw = await readFile(join(fakeHome, '.gitnexus', 'registry.json'), 'utf8');
    const reg = JSON.parse(raw) as { repos: unknown[] };
    expect(reg.repos).toHaveLength(1);
  });
});
```

If you took the no-op route from Step 3 (spike confirmed registry isn't needed), replace this entire file with a single skipped placeholder test and note the reason inline.

- [x] **Step 7: Create `lib/src/mcp/__tests__/config.test.ts`**

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpConfig } from '../config.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gn-config-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeMcpConfig', () => {
  it('writes a JSON file with the gitnexus server entry', async () => {
    const rel = await writeMcpConfig(dir, ['gitnexus']);
    expect(rel).toBe('.claude/mcp.json');
    const written = JSON.parse(await readFile(join(dir, rel), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(written.mcpServers['gitnexus']).toEqual({ command: 'gitnexus', args: ['mcp'] });
  });

  it('creates the .claude/ directory if missing', async () => {
    await writeMcpConfig(dir, ['gitnexus']);
    const s = await stat(join(dir, '.claude'));
    expect(s.isDirectory()).toBe(true);
  });

  it('omits unknown server names without throwing', async () => {
    await writeMcpConfig(dir, ['gitnexus', 'does-not-exist']);
    const written = JSON.parse(await readFile(join(dir, '.claude', 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(written.mcpServers)).toEqual(['gitnexus']);
  });
});
```

- [x] **Step 8: Run all new tests — expect every one to pass**

```
cd lib && npm test -- --reporter=verbose --testNamePattern="verifyGitnexusCache|writeRegistryEntry|writeMcpConfig"
```

Expected: 6 (cache) + 3 (registry) + 3 (config) = 12 passed (or 6 + 1 skipped + 3 = 10 if you took the no-op registry route).

- [x] **Step 9: Run the full worker test suite — expect no regressions**

```
cd lib && npm test
```

Expected: all tests pass.

- [x] **Step 10: Commit**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add lib/src/mcp/cache.ts lib/src/mcp/registry.ts lib/src/mcp/config.ts lib/src/mcp/__tests__/cache.test.ts lib/src/mcp/__tests__/registry.test.ts lib/src/mcp/__tests__/config.test.ts
git commit -m ":sparkles: feat(worker): add MCP helpers (verify cache, registry poke, config writer)"
```
