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
  cli_input_tokens: number;
  cli_output_tokens: number;
  cli_cache_read_tokens: number;
  cli_cache_creation_tokens: number;
  gates_parallel_ms: number;
  gates_serial_sum_ms: number;
  host_container_reuse: number;
  host_gitnexus_skipped: number;
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
  'cli_input_tokens',
  'cli_output_tokens',
  'cli_cache_read_tokens',
  'cli_cache_creation_tokens',
  'gates_parallel_ms',
  'gates_serial_sum_ms',
  'host_container_reuse',
  'host_gitnexus_skipped',
];

export function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
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
      cli_input_tokens: Number(obj['cli_input_tokens'] ?? 0),
      cli_output_tokens: Number(obj['cli_output_tokens'] ?? 0),
      cli_cache_read_tokens: Number(obj['cli_cache_read_tokens'] ?? 0),
      cli_cache_creation_tokens: Number(obj['cli_cache_creation_tokens'] ?? 0),
      gates_parallel_ms: Number(obj['gates_parallel_ms'] ?? 0),
      gates_serial_sum_ms: Number(obj['gates_serial_sum_ms'] ?? 0),
      host_container_reuse: Number(obj['host_container_reuse'] ?? 0),
      host_gitnexus_skipped: Number(obj['host_gitnexus_skipped'] ?? 0),
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
    'by-tool': Flags.boolean({
      description:
        'show per-tool elapsed time aggregated from cli_tool_timings in timings.json files',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Bench);

    if (flags['by-tool']) {
      await this.runByTool();
      return;
    }

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

  private async runByTool(): Promise<void> {
    const runsDir = join(process.cwd(), '.arandano', 'runs');
    let entries: string[] = [];
    try {
      const { readdir } = await import('node:fs/promises');
      entries = await readdir(runsDir);
    } catch {
      this.log('no runs directory found');
      return;
    }

    const agg: Record<string, { count: number; total_ms: number }> = {};
    for (const entry of entries) {
      const timingsPath = join(runsDir, entry, 'timings.json');
      try {
        const raw = await readFile(timingsPath, 'utf8');
        const parsed = JSON.parse(raw) as {
          cli_tool_timings?: Record<string, { count: number; total_ms: number }>;
        };
        if (parsed.cli_tool_timings) {
          for (const [tool, timing] of Object.entries(parsed.cli_tool_timings)) {
            const slot = (agg[tool] ??= { count: 0, total_ms: 0 });
            slot.count += timing.count;
            slot.total_ms += timing.total_ms;
          }
        }
      } catch {
        // skip missing or malformed
      }
    }

    const tools = Object.entries(agg).sort((a, b) => b[1].total_ms - a[1].total_ms);
    if (tools.length === 0) {
      this.log('no per-tool timing data found (run tasks with T1 worker first)');
      return;
    }

    this.log('tool                          calls   total_ms   median_ms_per_call');
    for (const [tool, { count, total_ms }] of tools) {
      const median_ms = count > 0 ? Math.round(total_ms / count) : 0;
      this.log(
        `${tool.padEnd(28)}  ${String(count).padStart(5)}  ${fmt(total_ms).padStart(9)}  ${fmt(median_ms).padStart(18)}`,
      );
    }
  }
}
