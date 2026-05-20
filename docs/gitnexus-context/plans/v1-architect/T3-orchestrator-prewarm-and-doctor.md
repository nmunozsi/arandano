> **Location:** `docs/gitnexus-context/plans/v1-architect/T3-orchestrator-prewarm-and-doctor.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md       ← you are here
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# T3 — Orchestrator host-side cache pre-warm + `arandano doctor` advisory check

**Repo:** `arandano` (monorepo)

**Files:**

- Create: `packages/core/src/mcp/cacheHost.ts`
- Create: `packages/core/src/mcp/__tests__/cacheHost.test.ts`
- Modify: `packages/core/src/orchestrator/runOne.ts`
- Modify: `packages/core/src/orchestrator/__tests__/runOne.test.ts`
- Modify: `packages/cli/src/commands/doctor.ts`

**Context:** Today the orchestrator never touches gitnexus. To pre-warm the `.gitnexus/` cache before dispatching tasks that need it, `runOne` calls `ensureGitnexusCacheHost(projectRoot)` whenever `taskRun.mcpServers.includes('gitnexus')`. The helper shells out to the host's gitnexus install. If the host binary is missing, the helper returns `'skipped'` and the run still dispatches (worker will detect the missing cache and skip MCP wiring).

This task also adds an **advisory** check to `arandano doctor` so users get a clear hint to `npm install -g gitnexus@<PINNED>` without `doctor` failing.

**Pick the pinned version at the start of this task.** Look up the latest stable `gitnexus` on npm (`npm view gitnexus version`), then use that exact string (e.g. `0.4.2`) for the rest of T3 — and the same string in T4 (Dockerfile) and the README update in T7. Record the version in T3's commit message body.

---

- [ ] **Step 1: Create `packages/core/src/mcp/cacheHost.ts`**

```typescript
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const PINNED_GITNEXUS_VERSION = '<PINNED_VERSION>';

export type CacheResult = 'cache-hit' | 'rebuilt' | 'skipped' | 'failed';

const STAMP_REL_PATH = '.gitnexus/.head-stamp';
const ANALYZE_TIMEOUT_MS = 5 * 60_000;

export interface EnsureOpts {
  log?: (line: string) => void;
}

async function gitnexusOnHost(): Promise<boolean> {
  try {
    await execFileAsync('gitnexus', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function currentHead(workspaceRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function readStamp(workspaceRoot: string): Promise<string | null> {
  const p = join(workspaceRoot, STAMP_REL_PATH);
  if (!existsSync(p)) return null;
  try {
    return (await readFile(p, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function writeStamp(workspaceRoot: string, head: string): Promise<void> {
  const p = join(workspaceRoot, STAMP_REL_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, head, 'utf8');
}

async function deleteStamp(workspaceRoot: string): Promise<void> {
  await rm(join(workspaceRoot, STAMP_REL_PATH), { force: true });
}

export async function ensureGitnexusCacheHost(
  workspaceRoot: string,
  opts: EnsureOpts = {},
): Promise<CacheResult> {
  const log = opts.log ?? (() => {});

  if (!(await gitnexusOnHost())) {
    log(
      `gitnexus: skipped (not installed on host — run \`npm install -g gitnexus@${PINNED_GITNEXUS_VERSION}\`)`,
    );
    return 'skipped';
  }

  const head = await currentHead(workspaceRoot);
  if (!head) {
    log(`gitnexus: skipped (not a git repo at ${workspaceRoot})`);
    return 'skipped';
  }

  const stamp = await readStamp(workspaceRoot);
  if (stamp === head) {
    log(`gitnexus: cache-hit (${head.slice(0, 8)})`);
    return 'cache-hit';
  }

  try {
    await execFileAsync('gitnexus', ['analyze'], {
      cwd: workspaceRoot,
      timeout: ANALYZE_TIMEOUT_MS,
    });
    await writeStamp(workspaceRoot, head);
    log(`gitnexus: rebuilt (${head.slice(0, 8)})`);
    return 'rebuilt';
  } catch (e) {
    await deleteStamp(workspaceRoot);
    log(`gitnexus: failed (${(e as Error).message.slice(0, 200)})`);
    return 'failed';
  }
}
```

Replace `<PINNED_VERSION>` with the version you looked up at the start of this task.

- [ ] **Step 2: Create `packages/core/src/mcp/__tests__/cacheHost.test.ts`**

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
import { execFile } from 'node:child_process';
import { ensureGitnexusCacheHost } from '../cacheHost.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gnh-'));
  vi.mocked(execFile).mockReset();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// promisify(execFile) calls execFile with a (err, stdout, stderr) callback as the LAST arg.
// Each mock entry maps a matched argv shape to an outcome.
const mockExecFile = (
  outcomes: Array<{ matchCmd: string; matchArgs?: string[]; err?: Error; stdout?: string }>,
): void => {
  vi.mocked(execFile).mockImplementation((cmd: string, argsOrOpts: unknown, ...rest: unknown[]) => {
    const args = Array.isArray(argsOrOpts) ? (argsOrOpts as string[]) : [];
    // last argument is the node callback
    const cb = rest[rest.length - 1] as (err: Error | null, stdout: string, stderr: string) => void;
    const m = outcomes.find(
      (o) =>
        o.matchCmd === cmd &&
        (o.matchArgs === undefined ||
          (o.matchArgs.length === args.length && o.matchArgs.every((a, i) => a === args[i]))),
    );
    if (!m) {
      cb(new Error(`unmatched execFile: ${cmd} ${args.join(' ')}`), '', '');
      return {} as never;
    }
    if (m.err) cb(m.err, '', '');
    else cb(null, m.stdout ?? '', '');
    return {} as never;
  });
};

describe('ensureGitnexusCacheHost', () => {
  it('returns "skipped" when host gitnexus is missing', async () => {
    mockExecFile([{ matchCmd: 'gitnexus', matchArgs: ['--version'], err: new Error('ENOENT') }]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('skipped');
  });

  it('returns "skipped" when not a git repo', async () => {
    mockExecFile([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], err: new Error('not a repo') },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('skipped');
  });

  it('returns "cache-hit" when stamp matches HEAD', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    await writeFile(join(dir, '.gitnexus', '.head-stamp'), 'abc123', 'utf8');
    mockExecFile([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], stdout: 'abc123\n' },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('cache-hit');
  });

  it('returns "rebuilt" and writes stamp when .gitnexus missing', async () => {
    mockExecFile([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], stdout: 'def456\n' },
      { matchCmd: 'gitnexus', matchArgs: ['analyze'], stdout: '' },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('rebuilt');
    expect((await readFile(join(dir, '.gitnexus', '.head-stamp'), 'utf8')).trim()).toBe('def456');
  });

  it('returns "failed" and deletes stamp on analyze error', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    await writeFile(join(dir, '.gitnexus', '.head-stamp'), 'oldsha', 'utf8');
    mockExecFile([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], stdout: 'newsha\n' },
      { matchCmd: 'gitnexus', matchArgs: ['analyze'], err: new Error('parse error') },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('failed');
    let stampGone = false;
    try {
      await readFile(join(dir, '.gitnexus', '.head-stamp'), 'utf8');
    } catch {
      stampGone = true;
    }
    expect(stampGone).toBe(true);
  });
});
```

- [ ] **Step 3: Run the new cacheHost tests — expect all 5 to pass**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="ensureGitnexusCacheHost"
```

Expected: 5 passed. If the `vi.mock('node:child_process', ...)` mock isn't picking up because of ESM hoisting issues, double-check the import order — the `vi.mock` call must be hoisted above the `import { execFile }` line at runtime (vitest handles this automatically; just ensure `vi.mock` is at top-level, not inside `beforeEach`).

- [ ] **Step 4: Wire `ensureGitnexusCacheHost` into `runOne`**

Open `packages/core/src/orchestrator/runOne.ts`. After `const taskRun: TaskRun = { ... }` (around line 142) and before `const handle = await executor.start(taskRun)` (around line 154), add:

```typescript
// Host-side gitnexus cache pre-warm — soft-fail.
if (taskRun.mcpServers.includes('gitnexus')) {
  const { ensureGitnexusCacheHost } = await import('../mcp/cacheHost.js');
  await ensureGitnexusCacheHost(projectRoot, {
    log: (line) => process.stderr.write(line + '\n'),
  });
}
```

The dynamic `await import` avoids adding `cacheHost.ts` to runOne's static module graph in test scenarios that don't exercise gitnexus — keeps the existing `runOne` tests fast.

Also add an import at the top (if `process.stderr.write` linting complains in your environment, swap for a config-aware logger; the existing file has no logger so stderr is the path of least resistance):

(no new import line needed — `process` is globally available)

- [ ] **Step 5: Add three failing tests to `runOne.test.ts`**

At the bottom of the file, append:

```typescript
describe('runOne — gitnexus cache pre-warm', () => {
  // These tests mock the host-side helper rather than the underlying execFile,
  // so they isolate runOne's wiring decision.
  it('calls ensureGitnexusCacheHost exactly once when mcpServers includes "gitnexus"', async () => {
    await seedProject();
    // Set up a task md with mcp: [gitnexus]
    const taskPath = join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-x.md');
    await mkdir(dirname(taskPath), { recursive: true });
    await writeFile(taskPath, '---\nid: T1\ntitle: x\nrole: coder\nmcp:\n  - gitnexus\n---\nbody');
    const ensureSpy = vi.fn().mockResolvedValue('cache-hit');
    vi.doMock('../../mcp/cacheHost.js', () => ({ ensureGitnexusCacheHost: ensureSpy }));
    await runOne({
      projectRoot: dir,
      taskId: 'T1',
      executor: okExecutor(),
      taskFilePath: taskPath,
    });
    expect(ensureSpy).toHaveBeenCalledTimes(1);
    expect(ensureSpy.mock.calls[0]?.[0]).toBe(dir);
    vi.doUnmock('../../mcp/cacheHost.js');
  });

  it('does NOT call ensureGitnexusCacheHost when mcpServers is empty', async () => {
    await seedProject();
    const ensureSpy = vi.fn();
    vi.doMock('../../mcp/cacheHost.js', () => ({ ensureGitnexusCacheHost: ensureSpy }));
    await runOne({ projectRoot: dir, taskId: 'T1', executor: okExecutor() });
    expect(ensureSpy).not.toHaveBeenCalled();
    vi.doUnmock('../../mcp/cacheHost.js');
  });

  it('dispatches the task even when ensureGitnexusCacheHost returns "failed"', async () => {
    await seedProject();
    const taskPath = join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-x.md');
    await mkdir(dirname(taskPath), { recursive: true });
    await writeFile(taskPath, '---\nid: T1\ntitle: x\nrole: coder\nmcp:\n  - gitnexus\n---\nbody');
    vi.doMock('../../mcp/cacheHost.js', () => ({
      ensureGitnexusCacheHost: vi.fn().mockResolvedValue('failed'),
    }));
    const startSpy = vi.fn(() => Promise.resolve({ id: 'T1' }));
    const exec: Executor = { ...okExecutor(), start: startSpy };
    const r = await runOne({
      projectRoot: dir,
      taskId: 'T1',
      executor: exec,
      taskFilePath: taskPath,
    });
    expect(startSpy).toHaveBeenCalled();
    expect(r.reason).toBe('ok');
    vi.doUnmock('../../mcp/cacheHost.js');
  });
});
```

Note: `seedProject` and `okExecutor` are existing helpers in this file from the `architect-plan-context` v1 work. If they aren't present (e.g. the file has been reorganized), follow the pattern in the existing `runOne — result.json back-propagation` block.

- [ ] **Step 6: Run the new runOne tests — expect all 3 to pass**

```
npm test --workspace packages/core -- --reporter=verbose --testNamePattern="gitnexus cache pre-warm"
```

Expected: 3 passed.

- [ ] **Step 7: Add the gitnexus advisory check to `arandano doctor`**

Open `packages/cli/src/commands/doctor.ts`. The current shape uses `{ name, ok, detail }`. Extend it to `{ name, ok, detail?, advisory? }` and adjust the output + exit-code logic.

Full replacement file content:

```typescript
import { Command } from '@oclif/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  advisory?: boolean;
}

export default class Doctor extends Command {
  static override description = 'Verify Docker, gh, and repo state.';

  async run(): Promise<void> {
    const checks: CheckResult[] = [];
    const root = process.cwd();

    checks.push(
      await tryCheck('docker available', () =>
        exec('docker', ['version', '--format', '{{.Server.Version}}']),
      ),
    );
    checks.push(await tryCheck('gh authenticated', () => exec('gh', ['auth', 'status'])));
    checks.push(
      await tryCheck('gitnexus available (advisory)', () => exec('gitnexus', ['--version']), {
        advisory: true,
      }),
    );
    checks.push(
      await tryCheck('config.yaml present', async () => {
        await readFile(join(root, '.arandano', 'config.yaml'), 'utf8');
      }),
    );
    checks.push(
      await tryCheck('git working tree clean', async () => {
        const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: root });
        if (stdout.trim()) throw new Error('dirty');
      }),
    );

    for (const c of checks) {
      const tag = c.ok ? 'ok  ' : c.advisory ? 'warn' : 'FAIL';
      this.log(`${tag}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    if (checks.some((c) => !c.ok && !c.advisory)) process.exit(1);
  }
}

async function tryCheck<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { advisory?: boolean } = {},
): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true, ...(opts.advisory ? { advisory: true } : {}) };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: (e as Error).message,
      ...(opts.advisory ? { advisory: true } : {}),
    };
  }
}
```

- [ ] **Step 8: Run the full `packages/core` and `packages/cli` suites — expect no regressions**

```
npm test --workspace packages/core
npm test --workspace packages/cli
```

Expected: all tests pass. If `packages/cli` has no existing doctor test and you'd like to add one, do it inline:

```typescript
// packages/cli/src/commands/__tests__/doctor.test.ts (only if you want it; not blocking)
// (Skipped here — covered by manual smoke in T7.)
```

- [ ] **Step 9: Commit**

```
git add packages/core/src/mcp/cacheHost.ts packages/core/src/mcp/__tests__/cacheHost.test.ts packages/core/src/orchestrator/runOne.ts packages/core/src/orchestrator/__tests__/runOne.test.ts packages/cli/src/commands/doctor.ts
git commit -m "$(cat <<'EOF'
:sparkles: feat(core): host-side gitnexus cache pre-warm + advisory doctor check

Pinned to gitnexus@<PINNED_VERSION>.
EOF
)"
```

Replace `<PINNED_VERSION>` with the version you chose at Step 1.
