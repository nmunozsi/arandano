import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config/load.js';
import { loadPlan } from '../tasks/loadPlan.js';
import { StateStore } from '../state/store.js';
import { selectReadyBatch, validateDag } from './dag.js';
import { runOne } from './runOne.js';
import type { Executor, ExitResult } from '../types/executor.js';
import type { TaskFrontmatter } from '../types/task.js';

export interface OrchestratorOpts {
  projectRoot: string;
  planSlug: string;
  executor: Executor;
}

export interface RunSummary {
  completed: string[];
  failed: string[];
  skipped: string[];
}

export class Orchestrator {
  constructor(private readonly opts: OrchestratorOpts) {}

  async run(): Promise<RunSummary> {
    const { projectRoot, planSlug, executor } = this.opts;
    const cfgText = await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8');
    const cfg = loadConfig(cfgText);
    const tasks = await loadPlan({ projectRoot, planSlug });
    const fms: TaskFrontmatter[] = tasks.map((t) => t.frontmatter);
    validateDag(fms);

    const store = new StateStore(join(projectRoot, '.arandano', 'state.json'));
    const completed: string[] = [];
    const failed: string[] = [];
    const inFlight = new Map<string, Promise<{ id: string; result: ExitResult }>>();

    for (;;) {
      const state = await store.read();
      const slots = cfg.batching.max_parallel - inFlight.size;
      const ready = selectReadyBatch({ tasks: fms, state, maxParallel: slots }).filter(
        (id) => !inFlight.has(id),
      );

      for (const id of ready) {
        inFlight.set(
          id,
          runOne({ projectRoot, taskId: id, executor }).then((result) => ({ id, result })),
        );
      }

      if (inFlight.size === 0) break;

      const { id: settledId, result } = await Promise.race(inFlight.values());
      inFlight.delete(settledId);

      if (result.reason === 'ok') {
        completed.push(settledId);
      } else {
        failed.push(settledId);
      }
    }

    const allIds = fms.map((t) => t.id);
    const skipped = allIds.filter((id) => !completed.includes(id) && !failed.includes(id));
    return { completed, failed, skipped };
  }
}
