import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../_exec.js', () => ({ execFileAsync: vi.fn() }));
import { execFileAsync } from '../_exec.js';
import { ensureGitnexusCacheHost } from '../cacheHost.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gnh-'));
  vi.mocked(execFileAsync).mockReset();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Each mock entry maps a matched argv shape to an outcome.
// execFileAsync calls resolve/reject directly (already promisified).
const mockExec = (
  outcomes: Array<{ matchCmd: string; matchArgs?: string[]; err?: Error; stdout?: string }>,
): void => {
  vi.mocked(execFileAsync).mockImplementation(((cmd: string, args?: readonly string[] | null) => {
    const a = Array.isArray(args) ? (args as string[]) : [];
    const m = outcomes.find(
      (o) =>
        o.matchCmd === cmd &&
        (o.matchArgs === undefined ||
          (o.matchArgs.length === a.length && o.matchArgs.every((x, i) => x === a[i]))),
    );
    if (!m) return Promise.reject(new Error(`unmatched execFileAsync: ${cmd} ${a.join(' ')}`));
    if (m.err) return Promise.reject(m.err);
    return Promise.resolve({ stdout: m.stdout ?? '', stderr: '' });
  }) as never);
};

describe('ensureGitnexusCacheHost', () => {
  it('returns "skipped" when host gitnexus is missing', async () => {
    mockExec([{ matchCmd: 'gitnexus', matchArgs: ['--version'], err: new Error('ENOENT') }]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('skipped');
  });

  it('returns "skipped" when not a git repo', async () => {
    mockExec([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], err: new Error('not a repo') },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('skipped');
  });

  it('returns "cache-hit" when stamp matches HEAD', async () => {
    await mkdir(join(dir, '.gitnexus'), { recursive: true });
    await writeFile(join(dir, '.gitnexus', '.head-stamp'), 'abc123', 'utf8');
    mockExec([
      { matchCmd: 'gitnexus', matchArgs: ['--version'], stdout: 'v0.x' },
      { matchCmd: 'git', matchArgs: ['rev-parse', 'HEAD'], stdout: 'abc123\n' },
    ]);
    const r = await ensureGitnexusCacheHost(dir);
    expect(r).toBe('cache-hit');
  });

  it('returns "rebuilt" and writes stamp when .gitnexus missing', async () => {
    mockExec([
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
    mockExec([
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
