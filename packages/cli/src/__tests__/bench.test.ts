import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv } from '../commands/bench.js';

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

describe('parseCsv', () => {
  it('parses old-format CSV (no cli_tool_calls/cli_commits columns) with defaults of 0', () => {
    // Old format: no cli_tool_calls or cli_commits columns
    const csv = [
      'timestamp,task_id,stack,image_sha,total_ms,host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms',
      '2026-05-14T01:00Z,T1,node-ts,sha256:b,100000,0,1000,500,98000,20000,50000,10000,1000',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cli_tool_calls).toBe(0);
    expect(rows[0]!.cli_commits).toBe(0);
    expect(Number.isNaN(rows[0]!.cli_tool_calls)).toBe(false);
    expect(Number.isNaN(rows[0]!.cli_commits)).toBe(false);
  });

  it('parses CRLF-terminated CSV without producing NaN values', () => {
    // Simulate CRLF line endings (e.g., file opened/saved on Windows)
    const csv =
      [
        'timestamp,task_id,stack,image_sha,total_ms,host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms,cli_tool_calls,cli_commits',
        '2026-05-14T01:00Z,T1,node-ts,sha256:b,100000,0,1000,500,98000,20000,50000,10000,1000,42,5',
      ].join('\r\n') + '\r\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.total_ms).toBe(100000);
    expect(rows[0]!.cli_tool_calls).toBe(42);
    expect(rows[0]!.cli_commits).toBe(5);
    for (const row of rows) {
      for (const val of Object.values(row)) {
        if (typeof val === 'number') {
          expect(Number.isNaN(val)).toBe(false);
        }
      }
    }
  });
});

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
