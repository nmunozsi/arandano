import { glob, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadConfig } from '../config/load.js';
import { parseTaskMd } from '../parsers/task-md.js';
import { StateStore } from '../state/store.js';
import type { Executor, ExitResult, TaskRun } from '../types/executor.js';

export interface RunOneOpts {
  projectRoot: string;
  taskId: string;
  executor: Executor;
  taskFilePath?: string;
  envOverride?: Record<string, string>;
}

export async function runOne(opts: RunOneOpts): Promise<ExitResult> {
  const { projectRoot, taskId, executor } = opts;

  const cfgText = await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8');
  const cfg = loadConfig(cfgText);

  const taskPath = opts.taskFilePath ?? (await findTaskMd(projectRoot, taskId));
  if (!taskPath) throw new Error(`task not found: ${taskId}`);
  const taskMd = parseTaskMd(await readFile(taskPath, 'utf8'), taskPath);

  const roleName = taskMd.frontmatter.role;
  const role = cfg.roles[roleName];
  if (!role) throw new Error(`role not configured: ${roleName}`);

  const taskRun: TaskRun = {
    taskId: taskMd.frontmatter.id,
    taskMdPath: relative(projectRoot, taskPath).replaceAll('\\', '/'),
    rolePath: `.arandano/roles/${roleName}.md`,
    contextPaths: ['src/CONTEXT.md', 'planning/memory/coding-standards.md'],
    cli: taskMd.frontmatter.cli ?? role.cli,
    model: taskMd.frontmatter.model ?? role.model,
    tdd: taskMd.frontmatter.tdd ?? role.tdd ?? 'strict',
    quality: { ...cfg.quality_defaults, ...(taskMd.frontmatter.quality ?? {}) } as never,
    envPass: cfg.executor.docker?.env_pass ?? [],
    ...(opts.envOverride !== undefined ? { envSet: opts.envOverride } : {}),
    workdir: cfg.executor.docker?.workdir ?? '/workspace',
    timeoutMs: (taskMd.frontmatter.timeout_minutes ?? cfg.batching.timeout_minutes) * 60_000,
    mcpServers: taskMd.frontmatter.mcp ?? [],
    ...(taskMd.frontmatter.inject_context !== undefined
      ? { injectContext: taskMd.frontmatter.inject_context }
      : {}),
    ...(taskMd.frontmatter.cli_budget_ms !== undefined
      ? { cliBudgetMs: taskMd.frontmatter.cli_budget_ms }
      : {}),
  };

  // Host-side gitnexus cache pre-warm — soft-fail.
  if (taskRun.mcpServers.includes('gitnexus')) {
    const { ensureGitnexusCacheHost } = await import('../mcp/cacheHost.js');
    await ensureGitnexusCacheHost(projectRoot, {
      log: (line) => process.stderr.write(line + '\n'),
    });
  }

  const store = new StateStore(join(projectRoot, '.arandano', 'state.json'));
  await store.update((state) => {
    const existing = state.tasks[taskRun.taskId];
    state.tasks[taskRun.taskId] = {
      retry_count: existing?.retry_count ?? 0,
      status: 'running',
      started_at: new Date().toISOString(),
    };
  });

  const handle = await executor.start(taskRun);
  const result = await executor.wait(handle, { timeoutMs: taskRun.timeoutMs });

  await store.update((state) => {
    const existing = state.tasks[taskRun.taskId] ?? { retry_count: 0, status: 'running' as const };
    state.tasks[taskRun.taskId] = {
      ...existing,
      status: result.reason === 'ok' ? 'completed' : 'failed',
      finished_at: new Date().toISOString(),
      ...(result.reason !== 'ok' ? { error: result.reason } : {}),
    };
  });

  if (result.reason === 'ok' && result.resultJsonPath) {
    try {
      const raw = await readFile(result.resultJsonPath, 'utf8');
      const r = JSON.parse(raw) as { branch?: unknown; pr_url?: unknown };
      if (typeof r.branch === 'string' || typeof r.pr_url === 'string') {
        await store.update((state) => {
          const t = state.tasks[taskRun.taskId];
          if (!t) return;
          if (typeof r.branch === 'string') t.branch = r.branch;
          if (typeof r.pr_url === 'string') t.pr_url = r.pr_url;
        });
      }
    } catch {
      // result.json absent or malformed — task still completed, silently skip
    }
  }

  return result;
}

async function findTaskMd(root: string, id: string): Promise<string | undefined> {
  const pattern = join(root, '.arandano', 'specs', '**', `${id}-*.md`).replaceAll('\\', '/');
  for await (const match of glob(pattern)) return match;
  return undefined;
}
