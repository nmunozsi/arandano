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
  inject_context?: string[]; // relative paths to inject into prompt
  cli_budget_ms?: number; // reserved for T9
}

export interface TaskMd {
  frontmatter: TaskFrontmatter;
  body: string;
  filePath: string;
}
