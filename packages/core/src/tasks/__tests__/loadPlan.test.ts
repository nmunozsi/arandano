import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan } from '../loadPlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plan-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('loadPlan', () => {
  it('loads all task MDs in a plan dir', async () => {
    const planDir = join(dir, '.arandano', 'tasks', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(
      join(planDir, 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\ndepends_on: [T1]\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
    expect(tasks.find((t) => t.frontmatter.id === 'T2')?.frontmatter.depends_on).toEqual(['T1']);
  });

  it('ignores non-task files', async () => {
    const planDir = join(dir, '.arandano', 'tasks', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(join(planDir, 'README.md'), '# not a task');
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id)).toEqual(['T1']);
  });
});
