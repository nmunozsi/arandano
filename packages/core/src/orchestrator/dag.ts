import type { TaskFrontmatter } from '../types/task.js';
import type { RunState } from '../types/state.js';

export function validateDag(tasks: TaskFrontmatter[]): void {
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    for (const d of t.depends_on ?? []) {
      if (!ids.has(d)) throw new Error(`task ${t.id} depends on unknown task ${d}`);
    }
  }
  // Kahn's algorithm — peel off zero-indegree nodes; any remaining indicates a cycle.
  const indeg = new Map<string, number>();
  for (const t of tasks) indeg.set(t.id, (t.depends_on ?? []).length);
  const queue: string[] = [];
  for (const [id, n] of indeg) if (n === 0) queue.push(id);
  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    processed += 1;
    for (const t of tasks) {
      if ((t.depends_on ?? []).includes(id)) {
        const next = (indeg.get(t.id) ?? 0) - 1;
        indeg.set(t.id, next);
        if (next === 0) queue.push(t.id);
      }
    }
  }
  if (processed !== tasks.length) throw new Error('cycle detected in task DAG');
}

export interface SelectOpts {
  tasks: TaskFrontmatter[];
  state: RunState;
  maxParallel: number;
}

export function selectReadyBatch(opts: SelectOpts): string[] {
  const status = (id: string) => opts.state.tasks[id]?.status;
  const settled = new Set(['completed', 'failed', 'running', 'skipped']);
  const ready: string[] = [];
  for (const t of opts.tasks) {
    if (settled.has(status(t.id) ?? '')) continue;
    const deps = t.depends_on ?? [];
    if (deps.some((d) => status(d) === 'failed')) continue;
    if (deps.every((d) => status(d) === 'completed')) ready.push(t.id);
  }
  return ready.slice(0, opts.maxParallel);
}
