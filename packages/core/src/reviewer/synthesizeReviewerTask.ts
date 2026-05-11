import type { TaskFrontmatter } from '../types/task.js';

export function synthesizeReviewerTask(opts: {
  source: TaskFrontmatter;
  prUrl: string;
}): TaskFrontmatter | null {
  if (!opts.source.quality?.reviewer_required) return null;
  return {
    id: `${opts.source.id}-review`,
    title: `Review ${opts.source.id}: ${opts.source.title}`,
    role: 'reviewer',
    depends_on: [opts.source.id],
  };
}
