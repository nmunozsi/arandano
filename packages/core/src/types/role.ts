import type { TddMode } from './task.js';

export interface RoleFrontmatter {
  name: string;
  cli: string;
  model: string;
  tdd?: TddMode;
}

export interface RoleMd {
  frontmatter: RoleFrontmatter;
  body: string;
  filePath: string;
}
