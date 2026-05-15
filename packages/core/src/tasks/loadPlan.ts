import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTaskMd } from '../parsers/task-md.js';
import type { TaskMd } from '../types/task.js';

export interface LoadPlanOpts {
  projectRoot: string;
  planSlug: string;
  specName?: string;
}

const TASK_FILE_RE = /^T\d+-.*\.md$/;
const PHASE_DIR_RE = /^phase-\d+-/;

export async function loadPlan(opts: LoadPlanOpts): Promise<TaskMd[]> {
  const planDirs = await locatePlanDirs(opts);
  if (planDirs.length === 0) {
    throw new Error(`plan not found: ${opts.planSlug}`);
  }
  if (planDirs.length > 1) {
    throw new Error(
      `plan slug "${opts.planSlug}" is ambiguous across specs: ${planDirs.join(', ')} — pass specName to disambiguate`,
    );
  }
  return readTasksFromPlanDir(planDirs[0]!);
}

async function locatePlanDirs(opts: LoadPlanOpts): Promise<string[]> {
  const specsRoot = join(opts.projectRoot, '.arandano', 'specs');
  const results: string[] = [];
  let specs: string[] = [];
  try {
    specs = await readdir(specsRoot);
  } catch {
    specs = [];
  }
  for (const spec of specs) {
    if (opts.specName && spec !== opts.specName) continue;
    const candidate = join(specsRoot, spec, 'plans', opts.planSlug);
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) results.push(candidate);
    } catch {
      /* not present in this spec */
    }
  }
  return results;
}

async function readTasksFromPlanDir(planDir: string): Promise<TaskMd[]> {
  const out: TaskMd[] = [];
  const entries = await readdir(planDir, { withFileTypes: true });
  // Collect direct T*.md files (single-phase / collapsed)
  for (const e of entries) {
    if (e.isFile() && TASK_FILE_RE.test(e.name)) {
      const fp = join(planDir, e.name);
      out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
    }
  }
  // Descend into phase-* subdirectories
  for (const e of entries) {
    if (e.isDirectory() && PHASE_DIR_RE.test(e.name)) {
      const phaseDir = join(planDir, e.name);
      const subs = await readdir(phaseDir);
      for (const f of subs) {
        if (TASK_FILE_RE.test(f)) {
          const fp = join(phaseDir, f);
          out.push(parseTaskMd(await readFile(fp, 'utf8'), fp));
        }
      }
    }
  }
  return out;
}
