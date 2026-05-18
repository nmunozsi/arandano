import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { loadConfig } from '../config/load.js';
import { loadPlan } from '../tasks/loadPlan.js';
import { StateStore } from '../state/store.js';
import { selectReadyBatch, validateDag } from './dag.js';
import { runOne } from './runOne.js';
import type { Executor, ExitResult } from '../types/executor.js';
import type { TaskFrontmatter } from '../types/task.js';
import { synthesizeReviewerTask } from '../reviewer/synthesizeReviewerTask.js';
import { synthesizeArchitectTask, type RunShape } from '../architect/synthesizeArchitectTask.js';

export interface OrchestratorOpts {
  projectRoot: string;
  planSlug: string;
  executor: Executor;
  specName?: string;
  phaseSlug?: string;
  withArchitect?: boolean;
  noArchitect?: boolean;
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
    const allTasks = await loadPlan({
      projectRoot,
      planSlug,
      ...(this.opts.specName !== undefined && { specName: this.opts.specName }),
    });
    const tasks = this.opts.phaseSlug
      ? allTasks.filter(
          (t) =>
            t.filePath.includes(`/phase-${this.opts.phaseSlug}/`) ||
            t.filePath.includes(`\\phase-${this.opts.phaseSlug}\\`),
        )
      : allTasks;
    const fms: TaskFrontmatter[] = tasks.map((t) => t.frontmatter);
    // Map from task id to its file path, used for co-locating synthesized reviewer tasks.
    const taskFilePaths = new Map(tasks.map((t) => [t.frontmatter.id, t.filePath]));

    const runShape: RunShape = this.opts.phaseSlug ? 'phase' : 'plan';
    const architectTask = synthesizeArchitectTask({
      tasks: fms,
      planSlug,
      enabledInConfig: cfg.roles['architect']?.enabled === true,
      withArchitect: this.opts.withArchitect === true,
      noArchitect: this.opts.noArchitect === true,
      runShape,
    });
    let architectPlanRoot: string | null = null;
    if (architectTask) {
      fms.push(architectTask);
      architectPlanRoot = tasks[0] ? dirname(tasks[0].filePath) : join(projectRoot, '.arandano');
      const archPath = join(architectPlanRoot, 'T-architect-auto.md');
      const depsLine =
        architectTask.depends_on && architectTask.depends_on.length > 0
          ? `depends_on: [${architectTask.depends_on.join(', ')}]\n`
          : '';
      await writeFile(
        archPath,
        `---\nid: T-architect\ntitle: "${architectTask.title.replace(/"/g, '\\"')}"\nrole: architect\ntdd: relaxed\n${depsLine}---\nRefresh docs/architecture.md after plan ${planSlug}. Read /opt/arandano/skills/architect/SKILL.md.\n`,
      );
      taskFilePaths.set('T-architect', archPath);
    }

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
        const taskFilePath = taskFilePaths.get(id);
        const envOverride =
          id === 'T-architect'
            ? {
                ARANDANO_PLAN_SLUG: planSlug,
                ...(architectPlanRoot ? { ARANDANO_PLAN_PATH: architectPlanRoot } : {}),
              }
            : undefined;
        inFlight.set(
          id,
          runOne({
            projectRoot,
            taskId: id,
            executor,
            ...(taskFilePath !== undefined ? { taskFilePath } : {}),
            ...(envOverride !== undefined ? { envOverride } : {}),
          }).then((result) => ({ id, result })),
        );
      }

      if (inFlight.size === 0) break;

      const { id: settledId, result } = await Promise.race(inFlight.values());
      inFlight.delete(settledId);

      if (result.reason === 'ok') {
        completed.push(settledId);
        const sourceFm = fms.find((t) => t.id === settledId);
        if (sourceFm?.role === 'coder') {
          const prUrl = (await store.read()).tasks[settledId]?.pr_url ?? '';
          const reviewer = synthesizeReviewerTask({ source: sourceFm, prUrl });
          if (reviewer) {
            fms.push(reviewer);
            // Write a task MD so runOne can find it via findTaskMd.
            // Co-locate the reviewer task next to the coder task file.
            const coderPath =
              taskFilePaths.get(settledId) ?? join(projectRoot, '.arandano', 'specs', '_auto');
            const reviewerDir = dirname(coderPath);
            const depsLine =
              reviewer.depends_on && reviewer.depends_on.length > 0
                ? `depends_on: [${reviewer.depends_on.join(', ')}]\n`
                : '';
            const reviewerPath = join(reviewerDir, `${reviewer.id}-auto.md`);
            await writeFile(
              reviewerPath,
              `---\nid: ${reviewer.id}\ntitle: "${reviewer.title.replace(/"/g, '\\"')}"\nrole: ${reviewer.role}\n${depsLine}---\nReview the PR opened by task ${settledId}.\n`,
            );
            taskFilePaths.set(reviewer.id, reviewerPath);
          }
        }
      } else {
        failed.push(settledId);
      }
    }

    const allIds = fms.map((t) => t.id);
    const skipped = allIds.filter((id) => !completed.includes(id) && !failed.includes(id));
    return { completed, failed, skipped };
  }
}
