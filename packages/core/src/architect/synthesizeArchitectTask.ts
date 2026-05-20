import type { TaskFrontmatter } from '../types/task.js';

export type RunShape = 'plan' | 'phase' | 'single';

export interface SynthesizeArchitectOpts {
  tasks: TaskFrontmatter[];
  planSlug: string;
  enabledInConfig: boolean;
  withArchitect: boolean;
  noArchitect: boolean;
  runShape: RunShape;
}

export function synthesizeArchitectTask(opts: SynthesizeArchitectOpts): TaskFrontmatter | null {
  if (opts.withArchitect && opts.noArchitect) {
    throw new Error('--with-architect and --no-architect are mutually exclusive');
  }
  if (opts.noArchitect) return null;
  if (opts.runShape === 'single') return null;
  if (opts.runShape === 'phase' && !opts.withArchitect) return null;
  if (opts.runShape === 'plan' && !opts.withArchitect && !opts.enabledInConfig) return null;

  return {
    id: 'T-architect',
    title: `Refresh docs/architecture.md after plan ${opts.planSlug}`,
    role: 'architect',
    depends_on: opts.tasks.map((t) => t.id),
    mcp: ['gitnexus'],
  };
}
