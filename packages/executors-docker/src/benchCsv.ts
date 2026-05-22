import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface BenchRow {
  timestamp: string;
  task_id: string;
  stack: string;
  image_sha: string;
  total_ms: number;
  host_gitnexus_prewarm_ms: number;
  host_pull_ms: number;
  host_clone_ms: number;
  host_wait_ms: number;
  worker_install_ms: number;
  worker_cli_ms: number;
  worker_gates_ms: number;
  worker_push_ms: number;
}

const HEADER =
  'timestamp,task_id,stack,image_sha,total_ms,host_gitnexus_prewarm_ms,host_pull_ms,host_clone_ms,host_wait_ms,worker_install_ms,worker_cli_ms,worker_gates_ms,worker_push_ms';

// Module-level mutex keyed by absolute file path so concurrent appends serialise
// even across multiple DockerExecutor instances in the same process.
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  locks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

function toCsvLine(r: BenchRow): string {
  return [
    r.timestamp,
    r.task_id,
    r.stack,
    r.image_sha,
    r.total_ms,
    r.host_gitnexus_prewarm_ms,
    r.host_pull_ms,
    r.host_clone_ms,
    r.host_wait_ms,
    r.worker_install_ms,
    r.worker_cli_ms,
    r.worker_gates_ms,
    r.worker_push_ms,
  ].join(',');
}

export async function appendBenchRow(path: string, row: BenchRow): Promise<void> {
  await withLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    let needsHeader = false;
    try {
      const head = await readFile(path, 'utf8');
      if (!head.startsWith('timestamp,')) needsHeader = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') needsHeader = true;
      else throw e;
    }
    if (needsHeader) {
      await writeFile(path, HEADER + '\n', 'utf8');
    }
    await appendFile(path, toCsvLine(row) + '\n', 'utf8');
  });
}
