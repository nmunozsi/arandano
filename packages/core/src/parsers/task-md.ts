import matter from 'gray-matter';
import { z } from 'zod';
import type { TaskFrontmatter, TaskMd } from '../types/task.js';

const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  role: z.string().min(1),
  depends_on: z.array(z.string()).optional(),
  cli: z.string().optional(),
  model: z.string().optional(),
  tdd: z.enum(['strict', 'relaxed']).optional(),
  timeout_minutes: z.number().int().positive().optional(),
  mcp: z.array(z.string()).optional(),
  tests: z.array(z.string()).optional(),
  acceptance: z.array(z.string()).optional(),
  quality: z.record(z.unknown()).optional(),
});

export function parseTaskMd(content: string, filePath: string): TaskMd {
  const { data, content: body } = matter(content);
  const parsed = TaskFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid task frontmatter in ${filePath}: ${issues}`);
  }
  return {
    frontmatter: parsed.data as TaskFrontmatter,
    body,
    filePath,
  };
}
