import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTaskMd } from '../parsers/task-md.js';
import type { TaskMd } from '../types/task.js';

export async function loadPlan(opts: { projectRoot: string; planSlug: string }): Promise<TaskMd[]> {
  const dir = join(opts.projectRoot, '.arandano', 'tasks', opts.planSlug);
  const entries = await readdir(dir);
  const out: TaskMd[] = [];
  for (const name of entries) {
    if (!/^T\d+-.*\.md$/.test(name)) continue;
    const fp = join(dir, name);
    out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
  }
  return out;
}
