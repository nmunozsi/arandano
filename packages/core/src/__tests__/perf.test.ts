import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerfRecorder } from '../perf.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-perf-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('PerfRecorder', () => {
  it('records the duration of a single phase', async () => {
    const r = new PerfRecorder();
    const stop = r.start('install');
    await new Promise((res) => setTimeout(res, 20));
    stop();
    const recs = r.records();
    expect(recs).toHaveLength(1);
    expect(recs[0]?.phase).toBe('install');
    expect(recs[0]?.ms).toBeGreaterThanOrEqual(15);
  });

  it('records multiple phases in insertion order', () => {
    const r = new PerfRecorder();
    r.start('a')();
    r.start('b')();
    r.start('c')();
    expect(r.records().map((x) => x.phase)).toEqual(['a', 'b', 'c']);
  });

  it('writes timings.json with task_id, host, worker, total_ms fields', async () => {
    const r = new PerfRecorder();
    r.start('install')();
    r.start('cli')();
    const path = join(dir, 'timings.json');
    await r.writeTimingsJson(path, { taskId: 'T1', side: 'worker' });
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(parsed['task_id']).toBe('T1');
    expect(parsed['worker']).toEqual(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        install: expect.any(Number),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        cli: expect.any(Number),
      }),
    );
    expect(parsed['total_ms']).toBeGreaterThanOrEqual(0);
  });

  it('does not double-count when stop is called twice', () => {
    const r = new PerfRecorder();
    const stop = r.start('x');
    stop();
    stop();
    expect(r.records()).toHaveLength(1);
  });
});
