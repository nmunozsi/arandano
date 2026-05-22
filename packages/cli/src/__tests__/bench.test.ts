import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-bench-cmd-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const SAMPLE_CSV =
  [
    'timestamp,task_id,stack,image_sha,total_ms,host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms',
    '2026-05-14T01:00Z,T4,node-ts,sha256:a,900000,0,8000,3000,870000,180000,400000,80000,4000',
    '2026-05-14T02:00Z,T4,node-ts,sha256:a,820000,0,8000,3000,790000,170000,380000,75000,4000',
    '2026-05-14T03:00Z,T5,node-ts,sha256:a,910000,0,8000,3000,880000,180000,410000,80000,4000',
  ].join('\n') + '\n';

describe('arandano bench', () => {
  it('summarises rows from the CSV', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'bench.csv'), SAMPLE_CSV, 'utf8');
    const logs: string[] = [];
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    try {
      const Bench = (await import('../commands/bench.js')).default;
      await Bench.run([]);
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
    const out = logs.join('\n');
    expect(out).toContain('T4');
    expect(out).toContain('T5');
    expect(out).toContain('total_ms');
  });

  it('filters by --task', async () => {
    await mkdir(join(dir, '.arandano'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'bench.csv'), SAMPLE_CSV, 'utf8');
    const logs: string[] = [];
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    try {
      const Bench = (await import('../commands/bench.js')).default;
      await Bench.run(['--task', 'T4']);
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
    const out = logs.join('\n');
    expect(out).toContain('T4');
    expect(out).not.toContain('T5');
  });

  it('reports no data when CSV is missing', async () => {
    const logs: string[] = [];
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    try {
      const Bench = (await import('../commands/bench.js')).default;
      await Bench.run([]);
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(logs.join('\n')).toContain('no benchmark data');
  });
});
