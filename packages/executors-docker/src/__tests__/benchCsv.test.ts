import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendBenchRow, type BenchRow } from '../benchCsv.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-bench-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const row = (over: Partial<BenchRow> = {}): BenchRow => ({
  timestamp: '2026-05-14T12:00:00Z',
  task_id: 'T4',
  stack: 'node-ts',
  image_sha: 'sha256:abc',
  total_ms: 900000,
  host_gitnexus_prewarm_ms: 0,
  host_pull_ms: 8000,
  host_clone_ms: 3000,
  host_wait_ms: 870000,
  worker_install_ms: 180000,
  worker_cli_ms: 410000,
  worker_gates_ms: 80000,
  worker_push_ms: 4000,
  ...over,
});

describe('appendBenchRow', () => {
  it('writes the header on first call', async () => {
    const csv = join(dir, 'bench.csv');
    await appendBenchRow(csv, row());
    const content = await readFile(csv, 'utf8');
    expect(content.split('\n')[0]).toContain('timestamp,task_id,stack,image_sha,total_ms');
    expect(content.split('\n')[1]).toContain('T4');
  });

  it('appends without re-writing the header', async () => {
    const csv = join(dir, 'bench.csv');
    await appendBenchRow(csv, row({ task_id: 'T4' }));
    await appendBenchRow(csv, row({ task_id: 'T5' }));
    const lines = (await readFile(csv, 'utf8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('T4');
    expect(lines[2]).toContain('T5');
  });

  it('serialises concurrent appends', async () => {
    const csv = join(dir, 'bench.csv');
    await Promise.all([
      appendBenchRow(csv, row({ task_id: 'T4' })),
      appendBenchRow(csv, row({ task_id: 'T5' })),
      appendBenchRow(csv, row({ task_id: 'T6' })),
    ]);
    const lines = (await readFile(csv, 'utf8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3 rows
    const ids = lines.slice(1).map((l) => l.split(',')[1]);
    expect(ids.sort()).toEqual(['T4', 'T5', 'T6']);
  });
});
