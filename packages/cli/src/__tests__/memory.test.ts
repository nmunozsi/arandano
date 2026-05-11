import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-memory-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await rm(dir, { recursive: true, force: true });
});

describe('arandano memory promote', () => {
  it('appends a block to coding-standards.md from a run journal', async () => {
    const { default: MemoryPromote } = await import('../commands/memory/promote.js');
    const runFolder = '2026-05-11T10-00Z-T1';
    const journalDir = join(dir, '.arandano', 'runs', runFolder);
    await mkdir(journalDir, { recursive: true });
    await writeFile(join(journalDir, 'journal.md'), 'Found: use real db in tests.', 'utf8');
    await mkdir(join(dir, 'planning', 'memory'), { recursive: true });
    await writeFile(
      join(dir, 'planning', 'memory', 'coding-standards.md'),
      '# Standards\n',
      'utf8',
    );

    await MemoryPromote.run([
      runFolder,
      '--section=Testing',
      '--rule=Use real database, not mocks',
    ]);

    const result = await readFile(join(dir, 'planning', 'memory', 'coding-standards.md'), 'utf8');
    expect(result).toContain('### Testing');
    expect(result).toContain('**Rule:** Use real database, not mocks');
    expect(result).toContain('Found: use real db in tests.');
  });

  it('creates standards file via appendFile if it does not exist', async () => {
    const { default: MemoryPromote } = await import('../commands/memory/promote.js');
    const runFolder = '2026-05-11T11-00Z-T2';
    const journalDir = join(dir, '.arandano', 'runs', runFolder);
    await mkdir(journalDir, { recursive: true });
    await writeFile(join(journalDir, 'journal.md'), 'Always commit small.', 'utf8');
    await mkdir(join(dir, 'planning', 'memory'), { recursive: true });

    await MemoryPromote.run([runFolder, '--section=Git', '--rule=Small commits']);

    const result = await readFile(join(dir, 'planning', 'memory', 'coding-standards.md'), 'utf8');
    expect(result).toContain('### Git');
    expect(result).toContain('Small commits');
  });

  it('throws if run journal does not exist', async () => {
    const { default: MemoryPromote } = await import('../commands/memory/promote.js');
    await expect(MemoryPromote.run(['missing-run', '--section=X', '--rule=Y'])).rejects.toThrow();
  });
});
