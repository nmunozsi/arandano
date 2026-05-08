import type { QualitySpec } from './quality.js';

export type TddMode = 'strict' | 'relaxed';

export interface TaskFrontmatter {
  id: string;
  title: string;
  depends_on?: string[];
  role: string;
  cli?: string;
  model?: string;
  tdd?: TddMode;
  timeout_minutes?: number;
  mcp?: string[];
  tests?: string[];
  acceptance?: string[];
  quality?: Partial<QualitySpec>;
}

export interface TaskMd {
  frontmatter: TaskFrontmatter;
  body: string;
  filePath: string;
}
