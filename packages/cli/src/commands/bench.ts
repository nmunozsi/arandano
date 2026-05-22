import { Command, Flags } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Row {
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
  cli_tool_calls: number;
  cli_commits: number;
}

const NUM_COLS: Array<keyof Row> = [
  'total_ms',
  'host_gitnexus_prewarm_ms',
  'host_pull_ms',
  'host_clone_ms',
  'host_wait_ms',
  'worker_install_ms',
  'worker_cli_ms',
  'worker_gates_ms',
  'worker_push_ms',
  'cli_tool_calls',
  'cli_commits',
];

function parseCsv(text: string): Row[] {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return {
      timestamp: obj['timestamp'] ?? '',
      task_id: obj['task_id'] ?? '',
      stack: obj['stack'] ?? '',
      image_sha: obj['image_sha'] ?? '',
      total_ms: Number(obj['total_ms'] ?? 0),
      host_gitnexus_prewarm_ms: Number(obj['host_gitnexus_prewarm_ms'] ?? 0),
      host_pull_ms: Number(obj['host_pull_ms'] ?? 0),
      host_clone_ms: Number(obj['host_clone_ms'] ?? 0),
      host_wait_ms: Number(obj['host_wait_ms'] ?? 0),
      worker_install_ms: Number(obj['worker_install_ms'] ?? 0),
      worker_cli_ms: Number(obj['worker_cli_ms'] ?? 0),
      worker_gates_ms: Number(obj['worker_gates_ms'] ?? 0),
      worker_push_ms: Number(obj['worker_push_ms'] ?? 0),
      cli_tool_calls: Number(obj['cli_tool_calls'] ?? 0),
      cli_commits: Number(obj['cli_commits'] ?? 0),
    };
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function p95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)));
  return s[idx] ?? 0;
}

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtVal(col: keyof Row, val: number): string {
  return col.endsWith('_ms') ? fmt(val) : val.toLocaleString('en-US');
}

export default class Bench extends Command {
  static override description = 'Summarise .arandano/bench.csv with per-phase median and p95.';

  static override flags = {
    task: Flags.string({ description: 'filter to a single task id' }),
    plan: Flags.string({ description: 'reserved — filter by plan slug (not yet implemented)' }),
    last: Flags.integer({ description: 'only consider the last N rows', default: 0 }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Bench);
    const csvPath = join(process.cwd(), '.arandano', 'bench.csv');
    let text: string;
    try {
      text = await readFile(csvPath, 'utf8');
    } catch {
      this.log(`no benchmark data found at ${csvPath}`);
      return;
    }
    let rows = parseCsv(text);
    if (flags.task) rows = rows.filter((r) => r.task_id === flags.task);
    if (flags.last && flags.last > 0) rows = rows.slice(-flags.last);

    if (rows.length === 0) {
      this.log('no benchmark data after filters');
      return;
    }

    this.log(
      `samples: ${rows.length}  tasks: ${[...new Set(rows.map((r) => r.task_id))].join(',')}`,
    );
    this.log('');
    this.log('phase                              median        p95     last      Δ-vs-prev');

    for (const col of NUM_COLS) {
      const vals = rows.map((r) => r[col] as number);
      const last = vals[vals.length - 1] ?? 0;
      const prev = vals[vals.length - 2];
      const delta =
        prev != null && prev !== 0 ? `${(((last - prev) / prev) * 100).toFixed(1)}%` : '—';
      this.log(
        `${col.padEnd(32)} ${fmtVal(col, median(vals)).padStart(8)}  ${fmtVal(col, p95(vals)).padStart(8)}  ${fmtVal(col, last).padStart(8)}   ${delta.padStart(7)}`,
      );
    }
  }
}
